import { PrismaClient, PaymentStatus } from '@prisma/client';
import { createLogger } from './logger.js';

const logger = createLogger('idempotency');

/**
 * Idempotency & Event Safety Framework
 * 
 * Ensures:
 * 1. Duplicate webhook events are safely ignored
 * 2. Payment state can only move forward
 * 3. All webhook payloads are stored for audit
 */

// ===================
// WEBHOOK IDEMPOTENCY
// ===================

export interface WebhookEventInput {
    provider: string;
    eventId: string;
    eventType: string;
    rawPayload: unknown;
}

/**
 * Store a webhook event and check if it's new
 * 
 * @returns true if this is a new event, false if duplicate
 */
export async function storeWebhookEvent(
    prisma: PrismaClient,
    event: WebhookEventInput
): Promise<boolean> {
    try {
        await prisma.webhookEvent.create({
            data: {
                provider: event.provider,
                eventId: event.eventId,
                eventType: event.eventType,
                rawPayload: event.rawPayload as object,
            },
        });

        logger.info({
            provider: event.provider,
            eventId: event.eventId,
            eventType: event.eventType
        }, 'New webhook event stored');

        return true;
    } catch (error: unknown) {
        // Check for unique constraint violation (duplicate event)
        if (
            error instanceof Error &&
            'code' in error &&
            (error as { code: string }).code === 'P2002'
        ) {
            logger.info({
                provider: event.provider,
                eventId: event.eventId
            }, 'Duplicate webhook event ignored');

            return false;
        }

        // Re-throw other errors
        throw error;
    }
}

/**
 * Check if an event has already been processed
 */
export async function isEventProcessed(
    prisma: PrismaClient,
    _provider: string,
    eventId: string
): Promise<boolean> {
    const event = await prisma.webhookEvent.findUnique({
        where: { eventId },
        select: { processedAt: true },
    });

    return event?.processedAt !== null;
}

/**
 * Mark an event as processed
 */
export async function markEventProcessed(
    prisma: PrismaClient,
    eventId: string
): Promise<void> {
    await prisma.webhookEvent.update({
        where: { eventId },
        data: { processedAt: new Date() },
    });

    logger.info({ eventId }, 'Webhook event marked as processed');
}

// ===================
// PAYMENT STATE MACHINE
// ===================

/**
 * Valid payment state transitions
 * 
 * PENDING -> CONFIRMED ✓
 * PENDING -> FAILED    ✓
 * CONFIRMED -> *       ✗
 * FAILED  -> *         ✗
 */
const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    PENDING: [PaymentStatus.CONFIRMED, PaymentStatus.FAILED],
    CONFIRMED: [], // Terminal state - immutable
    FAILED: [],    // Terminal state
};

/**
 * Check if a payment status transition is valid
 */
export function canTransitionPaymentStatus(
    currentStatus: PaymentStatus,
    newStatus: PaymentStatus
): boolean {
    // Same status is always valid (no-op)
    if (currentStatus === newStatus) {
        return true;
    }

    return VALID_TRANSITIONS[currentStatus].includes(newStatus);
}

/**
 * Attempt to transition a payment to a new status
 * 
 * @throws Error if transition is invalid
 */
export async function transitionPaymentStatus(
    prisma: PrismaClient,
    paymentId: string,
    newStatus: PaymentStatus
): Promise<void> {
    // Get current payment status
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { status: true },
    });

    if (!payment) {
        throw new Error(`Payment ${paymentId} not found`);
    }

    // Validate transition
    if (!canTransitionPaymentStatus(payment.status, newStatus)) {
        logger.warn({
            paymentId,
            currentStatus: payment.status,
            attemptedStatus: newStatus,
        }, 'Invalid payment status transition attempted');

        throw new Error(
            `Invalid payment status transition: ${payment.status} -> ${newStatus}`
        );
    }

    // Same status = no-op
    if (payment.status === newStatus) {
        logger.debug({ paymentId, status: newStatus }, 'Payment already in target status');
        return;
    }

    // Perform transition
    await prisma.payment.update({
        where: { id: paymentId },
        data: {
            status: newStatus,
            verifiedAt: newStatus === PaymentStatus.CONFIRMED ? new Date() : undefined,
            failedAt: newStatus === PaymentStatus.FAILED ? new Date() : undefined,
        },
    });

    logger.info({
        paymentId,
        from: payment.status,
        to: newStatus,
    }, 'Payment status transitioned');
}

// ===================
// IDEMPOTENT WEBHOOK HANDLER
// ===================

export interface WebhookHandlerResult {
    isNew: boolean;
    processed: boolean;
    error?: string;
}

/**
 * Idempotent webhook handler wrapper
 * 
 * Usage:
 * ```
 * const result = await handleWebhookIdempotently(prisma, event, async () => {
 *   // Your webhook processing logic here
 * });
 * ```
 */
export async function handleWebhookIdempotently(
    prisma: PrismaClient,
    event: WebhookEventInput,
    handler: () => Promise<void>
): Promise<WebhookHandlerResult> {
    // Step 1: Store event (fails silently if duplicate)
    const isNew = await storeWebhookEvent(prisma, event);

    if (!isNew) {
        return { isNew: false, processed: false };
    }

    // Step 2: Process the event
    try {
        await handler();

        // Step 3: Mark as processed
        await markEventProcessed(prisma, event.eventId);

        return { isNew: true, processed: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error({
            eventId: event.eventId,
            error: errorMessage
        }, 'Webhook processing failed');

        return { isNew: true, processed: false, error: errorMessage };
    }
}
