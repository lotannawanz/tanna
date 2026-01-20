import { createLogger } from './logger.js';

const logger = createLogger('events');

// ===================
// DOMAIN EVENTS
// ===================

/**
 * Domain events are emitted when significant business events occur.
 * 
 * IMPORTANT: These events have NO SIDE EFFECTS in Epic 4.
 * They exist for:
 * 1. Audit logging
 * 2. Future integration points (WhatsApp notifications, order creation, etc.)
 * 3. Clear separation of concerns
 */

export type PaymentEventType = 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED';

export interface PaymentEvent {
    type: PaymentEventType;
    paymentId: string;
    internalRef: string;
    amount: number;
    currency: string;
    metadata: Record<string, unknown> | null;
    timestamp: Date;
}

// ===================
// EVENT EMITTER
// ===================

/**
 * Emit a payment event
 * 
 * In Epic 4, this only logs the event.
 * Future epics will add:
 * - WhatsApp notifications
 * - Order creation
 * - Vendor alerts
 */
export async function emitPaymentEvent(event: PaymentEvent): Promise<void> {
    // Log the event for audit trail
    logger.info({
        eventType: event.type,
        paymentId: event.paymentId,
        internalRef: event.internalRef,
        amount: event.amount,
        currency: event.currency,
        metadata: event.metadata,
        timestamp: event.timestamp.toISOString(),
    }, `Domain event emitted: ${event.type}`);

    // Future: Add event handlers here
    // Example:
    // - await notifyVendorViaWhatsApp(event);
    // - await createOrderFromPayment(event);
    // - await updateAnalytics(event);
}

// ===================
// EVENT SUBSCRIBERS (Placeholder)
// ===================

/**
 * Subscribe to payment events
 * 
 * This is a placeholder for future event handling.
 * In a production system, this would use a proper event bus.
 */
export type PaymentEventHandler = (event: PaymentEvent) => Promise<void>;

const eventHandlers: PaymentEventHandler[] = [];

export function subscribeToPaymentEvents(handler: PaymentEventHandler): void {
    eventHandlers.push(handler);
    logger.debug(`Payment event handler registered. Total handlers: ${eventHandlers.length}`);
}

/**
 * Dispatch event to all registered handlers
 * 
 * NOTE: Not used in Epic 4. Reserved for future use.
 */
export async function dispatchPaymentEvent(event: PaymentEvent): Promise<void> {
    for (const handler of eventHandlers) {
        try {
            await handler(event);
        } catch (error) {
            logger.error({
                eventType: event.type,
                paymentId: event.paymentId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Event handler failed');
            // Don't throw - other handlers should still run
        }
    }
}
