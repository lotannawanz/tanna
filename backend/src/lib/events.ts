import { createLogger } from './logger.js';

const logger = createLogger('events');

// ===================
// DOMAIN EVENT TYPES
// ===================

/**
 * Domain event type definitions.
 *
 * These types are kept for use by job handlers and future consumers.
 * The in-process event bus (subscribe/dispatch) has been replaced by
 * the durable job queue.
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

/**
 * Emit a payment event (audit log only).
 *
 * This is kept for backward compatibility and audit trail.
 * Actual notification dispatch is handled by the job queue.
 */
export async function emitPaymentEvent(event: PaymentEvent): Promise<void> {
    logger.info({
        eventType: event.type,
        paymentId: event.paymentId,
        internalRef: event.internalRef,
        amount: event.amount,
        currency: event.currency,
        timestamp: event.timestamp.toISOString(),
    }, `Domain event emitted: ${event.type}`);
}
