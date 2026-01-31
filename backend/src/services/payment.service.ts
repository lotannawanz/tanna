import { PrismaClient, PaymentStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { createLogger } from '../lib/logger.js';
import {
    initializePaystackTransaction,
    PaystackWebhookEvent,
    parsePaystackEventOutcome,
} from './paystack.js';
import { transitionPaymentStatus } from '../lib/idempotency.js';
import { emitPaymentEvent } from '../lib/events.js';

const logger = createLogger('payment-service');

// ===================
// TYPES
// ===================

export interface CreatePaymentIntentInput {
    amount: number;       // In kobo
    currency: string;     // NGN only for now
    email: string;        // Customer email for Paystack
    vendorRef?: string;   // Placeholder vendor reference
    productRef?: string;  // Placeholder product reference
    callbackUrl?: string; // Optional callback URL
}

export interface PaymentIntentResult {
    paymentId: string;
    internalRef: string;
    paystackRef: string;
    authorizationUrl: string;
}

export interface PaymentVerificationResult {
    paymentId: string;
    status: 'confirmed' | 'failed' | 'not_found' | 'mismatch';
    reason?: string;
}

// ===================
// REFERENCE GENERATION
// ===================

/**
 * Generate a unique internal payment reference
 * 
 * Format: TNN_{timestamp}_{random}
 * Example: TNN_1705672800_a1b2c3d4
 */
export function generateInternalRef(): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const random = randomBytes(4).toString('hex');
    return `TNN_${timestamp}_${random}`;
}

// ===================
// PAYMENT INTENT
// ===================

/**
 * Create a payment intent
 * 
 * This is the FIRST step in payment flow:
 * 1. Generate internal reference
 * 2. Create PENDING payment record
 * 3. Initialize Paystack transaction
 * 4. Return redirect URL
 * 
 * NOTE: No order is created here. Payment intent is standalone.
 */
export async function createPaymentIntent(
    prisma: PrismaClient,
    input: CreatePaymentIntentInput
): Promise<PaymentIntentResult> {
    // Validate currency
    if (input.currency !== 'NGN') {
        throw new Error('Only NGN currency is supported');
    }

    // Validate amount
    if (input.amount <= 0 || !Number.isInteger(input.amount)) {
        throw new Error('Amount must be a positive integer in kobo');
    }

    // Generate unique internal reference
    const internalRef = generateInternalRef();

    // Build metadata for Paystack
    const metadata: Record<string, unknown> = {
        internal_ref: internalRef,
        vendor_ref: input.vendorRef || null,
        product_ref: input.productRef || null,
    };

    // Initialize Paystack transaction FIRST
    // This ensures we have a valid Paystack reference before persisting
    const paystackResponse = await initializePaystackTransaction({
        email: input.email,
        amount: input.amount,
        reference: internalRef,  // Use our internal ref as Paystack ref for easy matching
        currency: input.currency,
        metadata,
        callback_url: input.callbackUrl,
    });

    // Persist payment record with PENDING status
    const payment = await prisma.payment.create({
        data: {
            internalRef,
            amountKobo: input.amount,
            currency: input.currency,
            status: PaymentStatus.PENDING,
            paystackRef: paystackResponse.data.reference,
            metadata: metadata as any,
        },
    });

    logger.info({
        paymentId: payment.id,
        internalRef,
        amount: input.amount,
        currency: input.currency,
    }, 'Payment intent created');

    return {
        paymentId: payment.id,
        internalRef: payment.internalRef,
        paystackRef: paystackResponse.data.reference,
        authorizationUrl: paystackResponse.data.authorization_url,
    };
}

// ===================
// PAYMENT VERIFICATION
// ===================

/**
 * Process a Paystack webhook event and update payment status
 * 
 * This is the ONLY way to confirm a payment.
 * Redirects DO NOT confirm payments.
 * 
 * Epic 5: Also updates linked Order status:
 * - Payment CONFIRMED -> Order CONFIRMED
 * - Payment FAILED -> Order CANCELLED
 */
export async function processPaystackPaymentEvent(
    prisma: PrismaClient,
    event: PaystackWebhookEvent
): Promise<PaymentVerificationResult> {
    // Dynamic import to avoid circular dependency
    const { confirmOrder, cancelOrder, getOrderByPaymentId } = await import('./order.service.js');

    const reference = event.data.reference;

    // Find payment by Paystack reference
    const payment = await prisma.payment.findUnique({
        where: { paystackRef: reference },
    });

    if (!payment) {
        logger.warn({
            reference,
            paystackId: event.data.id,
        }, 'Payment not found for Paystack event');

        return {
            paymentId: '',
            status: 'not_found',
            reason: `No payment found for reference: ${reference}`,
        };
    }

    // Validate amount matches
    if (payment.amountKobo !== event.data.amount) {
        logger.error({
            paymentId: payment.id,
            expectedAmount: payment.amountKobo,
            receivedAmount: event.data.amount,
            reference,
        }, 'CRITICAL: Payment amount mismatch');

        return {
            paymentId: payment.id,
            status: 'mismatch',
            reason: `Amount mismatch: expected ${payment.amountKobo}, received ${event.data.amount}`,
        };
    }

    // Validate currency matches
    if (payment.currency !== event.data.currency) {
        logger.error({
            paymentId: payment.id,
            expectedCurrency: payment.currency,
            receivedCurrency: event.data.currency,
            reference,
        }, 'CRITICAL: Payment currency mismatch');

        return {
            paymentId: payment.id,
            status: 'mismatch',
            reason: `Currency mismatch: expected ${payment.currency}, received ${event.data.currency}`,
        };
    }

    // Determine outcome
    const outcome = parsePaystackEventOutcome(event);

    if (outcome === 'unknown') {
        logger.info({
            paymentId: payment.id,
            eventType: event.event,
        }, 'Ignoring non-payment event');

        return {
            paymentId: payment.id,
            status: 'confirmed',  // Not an error, just not a payment event
            reason: `Event type ${event.event} does not affect payment status`,
        };
    }

    // Transition payment status
    const newStatus = outcome === 'success'
        ? PaymentStatus.CONFIRMED
        : PaymentStatus.FAILED;

    try {
        await transitionPaymentStatus(prisma, payment.id, newStatus);

        // Update failure reason if failed
        if (newStatus === PaymentStatus.FAILED) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { failureReason: event.data.gateway_response },
            });
        }

        // EPIC 5: Update linked Order status
        // This is the ONLY place where order status changes due to payment
        const linkedOrder = await getOrderByPaymentId(prisma, payment.id);

        if (linkedOrder) {
            try {
                if (newStatus === PaymentStatus.CONFIRMED) {
                    await confirmOrder(prisma, linkedOrder.id);
                    logger.info({
                        orderId: linkedOrder.id,
                        paymentId: payment.id,
                    }, 'Order confirmed via webhook');
                } else {
                    await cancelOrder(prisma, linkedOrder.id);
                    logger.info({
                        orderId: linkedOrder.id,
                        paymentId: payment.id,
                    }, 'Order cancelled via webhook');
                }
            } catch (orderError) {
                // Order transition might fail if already in terminal state (idempotent)
                logger.warn({
                    orderId: linkedOrder.id,
                    error: orderError instanceof Error ? orderError.message : 'Unknown error',
                }, 'Order status transition skipped (likely already processed)');
            }
        } else {
            // No linked order - this is a legacy payment or standalone payment
            logger.info({
                paymentId: payment.id,
            }, 'No linked order found for payment');
        }

        // Emit domain event (no side effects yet)
        await emitPaymentEvent({
            type: newStatus === PaymentStatus.CONFIRMED ? 'PAYMENT_CONFIRMED' : 'PAYMENT_FAILED',
            paymentId: payment.id,
            internalRef: payment.internalRef,
            amount: payment.amountKobo,
            currency: payment.currency,
            metadata: payment.metadata as Record<string, unknown> | null,
            timestamp: new Date(),
        });

        logger.info({
            paymentId: payment.id,
            internalRef: payment.internalRef,
            newStatus,
        }, 'Payment status updated from webhook');

        return {
            paymentId: payment.id,
            status: newStatus === PaymentStatus.CONFIRMED ? 'confirmed' : 'failed',
        };
    } catch (error) {
        // State transition failed (likely already in terminal state)
        logger.warn({
            paymentId: payment.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Payment status transition failed');

        return {
            paymentId: payment.id,
            status: 'confirmed',  // Idempotent - already processed
            reason: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ===================
// PAYMENT LOOKUP
// ===================

/**
 * Get payment by internal reference or Paystack reference
 * Returns full order context for confirmation page
 */
export async function getPaymentByReference(
    prisma: PrismaClient,
    reference: string
) {
    return prisma.payment.findFirst({
        where: {
            OR: [
                { internalRef: reference },
                { paystackRef: reference },
            ],
        },
        select: {
            id: true,
            internalRef: true,
            paystackRef: true,
            status: true,
            amountKobo: true,
            currency: true,
            failureReason: true,
            createdAt: true,
            verifiedAt: true,
            order: {
                select: {
                    id: true,
                    vendorId: true,
                    status: true,
                    totalAmountKobo: true,
                    buyerPhone: true,
                    createdAt: true,
                    confirmedAt: true,
                },
            },
        },
    });
}
