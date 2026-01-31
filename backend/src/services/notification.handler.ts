import { createLogger } from '../lib/logger.js';
import { subscribeToOrderEvents, OrderEvent } from '../lib/events.js';
import { getPrismaClient } from '../lib/database.js';
import {
    sendBuyerPaymentConfirmed,
    sendVendorNewOrder,
    sendBuyerOrderFulfilled,
    OrderNotificationData,
} from './whatsapp.service.js';

const logger = createLogger('notification-handler');

// ===================
// EVENT HANDLERS
// ===================

/**
 * Handle ORDER_CONFIRMED event
 * 
 * Sends two notifications in parallel:
 * 1. Buyer: Payment confirmed
 * 2. Vendor: New order alert
 * 
 * Both sends are independent - one failure doesn't block the other.
 */
async function handleOrderConfirmed(event: OrderEvent): Promise<void> {
    logger.info({
        orderId: event.orderId,
        buyerPhone: event.buyerPhone.slice(-4),
    }, 'Handling ORDER_CONFIRMED event');

    const prisma = getPrismaClient();

    const notificationData: OrderNotificationData = {
        orderId: event.orderId,
        buyerPhone: event.buyerPhone,
        buyerName: extractBuyerName(event.buyerEmail),
        vendorPhone: event.vendorPhone || undefined,
        storeName: event.storeName,
        totalAmountKobo: event.totalAmountKobo,
        items: event.items,
    };

    // Send both notifications in parallel
    const [buyerResult, vendorResult] = await Promise.all([
        sendBuyerPaymentConfirmed(prisma, notificationData),
        sendVendorNewOrder(prisma, notificationData),
    ]);

    logger.info({
        orderId: event.orderId,
        buyerSuccess: buyerResult.success,
        vendorSuccess: vendorResult.success,
        buyerError: buyerResult.error,
        vendorError: vendorResult.error,
    }, 'ORDER_CONFIRMED notifications sent');
}

/**
 * Handle ORDER_FULFILLED event
 * 
 * Sends one notification:
 * - Buyer: Order fulfilled confirmation
 */
async function handleOrderFulfilled(event: OrderEvent): Promise<void> {
    logger.info({
        orderId: event.orderId,
        buyerPhone: event.buyerPhone.slice(-4),
    }, 'Handling ORDER_FULFILLED event');

    const prisma = getPrismaClient();

    const notificationData: OrderNotificationData = {
        orderId: event.orderId,
        buyerPhone: event.buyerPhone,
        buyerName: extractBuyerName(event.buyerEmail),
        storeName: event.storeName,
        totalAmountKobo: event.totalAmountKobo,
        items: event.items,
    };

    const result = await sendBuyerOrderFulfilled(prisma, notificationData);

    logger.info({
        orderId: event.orderId,
        success: result.success,
        error: result.error,
    }, 'ORDER_FULFILLED notification sent');
}

// ===================
// HELPER FUNCTIONS
// ===================

/**
 * Extract a display name from email
 * Uses the part before @ as a fallback name
 */
function extractBuyerName(email: string | null): string | undefined {
    if (!email) return undefined;

    const atIndex = email.indexOf('@');
    if (atIndex === -1) return undefined;

    const namePart = email.substring(0, atIndex);
    // Capitalize first letter
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}

// ===================
// REGISTRATION
// ===================

/**
 * Register all notification event handlers
 * 
 * This should be called once at application startup.
 */
export function registerNotificationHandlers(): void {
    subscribeToOrderEvents(async (event) => {
        switch (event.type) {
            case 'ORDER_CONFIRMED':
                await handleOrderConfirmed(event);
                break;
            case 'ORDER_FULFILLED':
                await handleOrderFulfilled(event);
                break;
            default:
                logger.warn({ eventType: event.type }, 'Unknown order event type');
        }
    });

    logger.info('Notification handlers registered for ORDER_CONFIRMED and ORDER_FULFILLED events');
}
