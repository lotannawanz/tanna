import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import {
    sendBuyerPaymentConfirmed,
    sendVendorNewOrder,
    sendBuyerOrderFulfilled,
    OrderNotificationData,
} from '../../services/whatsapp.service.js';

const logger = createLogger('handler:send-whatsapp');

/**
 * Handle a SEND_WHATSAPP job.
 *
 * Loads the order context and sends WhatsApp notifications.
 * Retryable errors (5xx, network) throw to trigger job retry.
 * Non-retryable errors (4xx) are swallowed.
 */
export async function handleSendWhatsappJob(
    prisma: PrismaClient,
    payload: Record<string, unknown>
): Promise<void> {
    const orderId = payload.orderId as string;
    const trigger = payload.trigger as string;

    // Load full order context
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
    });

    if (!order) {
        // Order deleted? Don't retry — it won't come back.
        logger.warn({ orderId }, 'Order not found for WhatsApp notification — skipping');
        return;
    }

    // Load vendor/store info
    let storeName = 'Store';
    let vendorPhone: string | undefined;

    const vendor = await prisma.vendor.findUnique({
        where: { id: order.vendorId },
        include: { store: true },
    });

    if (vendor?.store?.name) storeName = vendor.store.name;
    if (vendor?.phone) vendorPhone = vendor.phone;

    const notificationData: OrderNotificationData = {
        orderId: order.id,
        buyerPhone: order.buyerPhone,
        buyerName: extractBuyerName(order.buyerEmail),
        vendorPhone,
        storeName,
        totalAmountKobo: order.totalAmountKobo,
        items: order.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPriceKobo: item.unitPriceKobo,
        })),
    };

    if (trigger === 'ORDER_CONFIRMED') {
        const [buyerResult, vendorResult] = await Promise.all([
            sendBuyerPaymentConfirmed(prisma, notificationData),
            sendVendorNewOrder(prisma, notificationData),
        ]);

        // If either failed with a retryable error, throw to trigger job retry
        checkForRetryableFailure(buyerResult, 'buyer');
        checkForRetryableFailure(vendorResult, 'vendor');

        logger.info({
            orderId,
            buyerSuccess: buyerResult.success,
            vendorSuccess: vendorResult.success,
        }, 'ORDER_CONFIRMED WhatsApp notifications sent');
    } else if (trigger === 'ORDER_FULFILLED') {
        const result = await sendBuyerOrderFulfilled(prisma, notificationData);
        checkForRetryableFailure(result, 'buyer');

        logger.info({
            orderId,
            success: result.success,
        }, 'ORDER_FULFILLED WhatsApp notification sent');
    } else {
        logger.warn({ orderId, trigger }, 'Unknown WhatsApp trigger');
    }
}

/**
 * Throw on retryable errors (5xx, network). Swallow 4xx (template misconfiguration)
 * since retrying won't fix those.
 */
function checkForRetryableFailure(
    result: { success: boolean; error?: string },
    recipient: string
): void {
    if (result.success) return;

    const error = result.error || 'Unknown error';

    // 4xx errors from Meta API are not retryable
    if (error.includes('HTTP 4') || error.includes('not configured')) {
        logger.warn({ recipient, error }, 'Non-retryable WhatsApp error — swallowed');
        return;
    }

    // Everything else is retryable (5xx, network timeout, etc.)
    throw new Error(`Retryable WhatsApp failure for ${recipient}: ${error}`);
}

/**
 * Extract a display name from email.
 * Uses the part before @ as a fallback name.
 */
function extractBuyerName(email: string | null): string | undefined {
    if (!email) return undefined;
    const atIndex = email.indexOf('@');
    if (atIndex === -1) return undefined;
    const namePart = email.substring(0, atIndex);
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}
