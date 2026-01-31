import { createLogger } from './logger.js';

const logger = createLogger('events');

// ===================
// DOMAIN EVENTS
// ===================

/**
 * Domain events are emitted when significant business events occur.
 * 
 * IMPORTANT: Event handlers run as side effects and MUST NOT throw.
 * They exist for:
 * 1. Audit logging
 * 2. WhatsApp notifications (Epic 6)
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
// ORDER DOMAIN EVENTS (Epic 6)
// ===================

export type OrderEventType = 'ORDER_CONFIRMED' | 'ORDER_FULFILLED';

export interface OrderEvent {
    type: OrderEventType;
    orderId: string;
    vendorId: string;
    buyerPhone: string;
    buyerEmail: string | null;
    storeName: string;
    vendorPhone: string | null;
    totalAmountKobo: number;
    items: Array<{
        productName: string;
        quantity: number;
        unitPriceKobo: number;
    }>;
    timestamp: Date;
}

// ===================
// PAYMENT EVENT EMITTER
// ===================

/**
 * Emit a payment event
 * 
 * In Epic 4, this only logs the event.
 * In Epic 6+, this triggers notification handlers.
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
}

// ===================
// ORDER EVENT EMITTER (Epic 6)
// ===================

export type OrderEventHandler = (event: OrderEvent) => Promise<void>;

const orderEventHandlers: OrderEventHandler[] = [];

/**
 * Subscribe to order events
 * 
 * Used by notification handlers to react to order state changes.
 */
export function subscribeToOrderEvents(handler: OrderEventHandler): void {
    orderEventHandlers.push(handler);
    logger.debug(`Order event handler registered. Total handlers: ${orderEventHandlers.length}`);
}

/**
 * Emit an order event and dispatch to all registered handlers
 * 
 * CRITICAL: Handlers are fire-and-forget. Failures are logged but never thrown.
 * This ensures order state transitions are never blocked by side effects.
 */
export async function emitOrderEvent(event: OrderEvent): Promise<void> {
    // Log the event for audit trail
    logger.info({
        eventType: event.type,
        orderId: event.orderId,
        vendorId: event.vendorId,
        buyerPhone: event.buyerPhone.slice(-4),
        totalAmountKobo: event.totalAmountKobo,
        itemCount: event.items.length,
        timestamp: event.timestamp.toISOString(),
    }, `Domain event emitted: ${event.type}`);

    // Dispatch to all registered handlers (async, non-blocking)
    for (const handler of orderEventHandlers) {
        // Use setImmediate to ensure this is truly non-blocking
        setImmediate(async () => {
            try {
                await handler(event);
            } catch (error) {
                logger.error({
                    eventType: event.type,
                    orderId: event.orderId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                }, 'Order event handler failed');
                // Never throw - this is a side effect
            }
        });
    }
}

// ===================
// PAYMENT EVENT SUBSCRIBERS (Legacy)
// ===================

export type PaymentEventHandler = (event: PaymentEvent) => Promise<void>;

const paymentEventHandlers: PaymentEventHandler[] = [];

export function subscribeToPaymentEvents(handler: PaymentEventHandler): void {
    paymentEventHandlers.push(handler);
    logger.debug(`Payment event handler registered. Total handlers: ${paymentEventHandlers.length}`);
}

export async function dispatchPaymentEvent(event: PaymentEvent): Promise<void> {
    for (const handler of paymentEventHandlers) {
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

