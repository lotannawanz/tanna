import { PrismaClient, PaymentStatus, JobType } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { parsePaystackEventOutcome, PaystackWebhookEvent } from '../../services/paystack.js';
import { transitionPaymentStatus } from '../../lib/idempotency.js';
import { enqueueJob } from '../../lib/queue.js';

const logger = createLogger('handler:webhook-process');

/**
 * Handle a WEBHOOK_PROCESS job.
 *
 * Loads the stored WebhookEvent by eventId, processes the payment,
 * updates order status, and enqueues a WhatsApp notification job.
 */
export async function handleWebhookProcessJob(
    prisma: PrismaClient,
    payload: Record<string, unknown>
): Promise<void> {
    const eventId = payload.eventId as string;

    // Load the stored webhook event
    const webhookEvent = await prisma.webhookEvent.findUnique({
        where: { eventId },
    });

    if (!webhookEvent) {
        throw new Error(`WebhookEvent not found: ${eventId}`);
    }

    // Already processed — idempotent exit
    if (webhookEvent.processedAt) {
        logger.info({ eventId }, 'WebhookEvent already processed — skipping');
        return;
    }

    const event = webhookEvent.rawPayload as unknown as PaystackWebhookEvent;
    const reference = event.data.reference;

    // Find payment by Paystack reference
    const payment = await prisma.payment.findUnique({
        where: { paystackRef: reference },
    });

    if (!payment) {
        logger.warn({ reference, eventId }, 'Payment not found for Paystack event');
        // Mark processed so we don't retry indefinitely for orphaned events
        await prisma.webhookEvent.update({
            where: { eventId },
            data: { processedAt: new Date() },
        });
        return;
    }

    // Validate amount
    if (payment.amountKobo !== event.data.amount) {
        logger.error({
            paymentId: payment.id,
            expectedAmount: payment.amountKobo,
            receivedAmount: event.data.amount,
        }, 'CRITICAL: Payment amount mismatch');
        await prisma.webhookEvent.update({
            where: { eventId },
            data: { processedAt: new Date() },
        });
        return;
    }

    // Validate currency
    if (payment.currency !== event.data.currency) {
        logger.error({
            paymentId: payment.id,
            expectedCurrency: payment.currency,
            receivedCurrency: event.data.currency,
        }, 'CRITICAL: Payment currency mismatch');
        await prisma.webhookEvent.update({
            where: { eventId },
            data: { processedAt: new Date() },
        });
        return;
    }

    const outcome = parsePaystackEventOutcome(event);
    if (outcome === 'unknown') {
        logger.info({ eventId, eventType: event.event }, 'Non-payment event — marking processed');
        await prisma.webhookEvent.update({
            where: { eventId },
            data: { processedAt: new Date() },
        });
        return;
    }

    const newStatus = outcome === 'success' ? PaymentStatus.CONFIRMED : PaymentStatus.FAILED;

    // Transition payment status
    try {
        await transitionPaymentStatus(prisma, payment.id, newStatus);
    } catch (error) {
        // Already in terminal state = idempotent, not an error
        logger.warn({
            paymentId: payment.id,
            error: error instanceof Error ? error.message : 'Unknown',
        }, 'Payment transition skipped (likely already processed)');
    }

    if (newStatus === PaymentStatus.FAILED) {
        await prisma.payment.update({
            where: { id: payment.id },
            data: { failureReason: event.data.gateway_response },
        });
    }

    // Update linked order
    const { cancelOrder, getOrderByPaymentId, canTransitionOrderStatus } = await import('../../services/order.service.js');
    const { OrderStatus } = await import('@prisma/client');

    const linkedOrder = await getOrderByPaymentId(prisma, payment.id);

    if (linkedOrder) {
        try {
            if (newStatus === PaymentStatus.CONFIRMED) {
                // Confirm order directly (without inline event emission)
                const order = await prisma.order.findUnique({
                    where: { id: linkedOrder.id },
                    select: { status: true },
                });

                if (order && order.status !== OrderStatus.CONFIRMED) {
                    if (canTransitionOrderStatus(order.status, OrderStatus.CONFIRMED)) {
                        await prisma.order.update({
                            where: { id: linkedOrder.id },
                            data: {
                                status: OrderStatus.CONFIRMED,
                                confirmedAt: new Date(),
                            },
                        });
                    }
                }

                // Enqueue WhatsApp notifications as a separate durable job
                await enqueueJob(prisma, {
                    type: JobType.SEND_WHATSAPP,
                    payload: { orderId: linkedOrder.id, trigger: 'ORDER_CONFIRMED' },
                });
            } else {
                await cancelOrder(prisma, linkedOrder.id);
            }
        } catch (orderError) {
            logger.warn({
                orderId: linkedOrder.id,
                error: orderError instanceof Error ? orderError.message : 'Unknown',
            }, 'Order status transition skipped');
        }
    }

    // Mark webhook event as processed
    await prisma.webhookEvent.update({
        where: { eventId },
        data: { processedAt: new Date() },
    });

    logger.info({
        eventId,
        paymentId: payment.id,
        status: newStatus,
    }, 'Webhook processed successfully');
}
