import { PrismaClient, MessageStatus } from '@prisma/client';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('whatsapp-service');

// ===================
// CONFIGURATION
// ===================

interface WhatsAppConfig {
    apiToken: string;
    phoneNumberId: string;
    businessAccountId: string;
    templates: {
        buyerPaymentConfirmed: string;
        vendorNewOrder: string;
        buyerOrderFulfilled: string;
    };
}

function getWhatsAppConfig(): WhatsAppConfig {
    const config: WhatsAppConfig = {
        apiToken: process.env.WHATSAPP_API_TOKEN || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
        templates: {
            buyerPaymentConfirmed: process.env.WHATSAPP_TEMPLATE_BUYER_PAYMENT_CONFIRMED || 'buyer_payment_confirmed',
            vendorNewOrder: process.env.WHATSAPP_TEMPLATE_VENDOR_NEW_ORDER || 'vendor_new_order',
            buyerOrderFulfilled: process.env.WHATSAPP_TEMPLATE_BUYER_ORDER_FULFILLED || 'buyer_order_fulfilled',
        },
    };

    return config;
}

// ===================
// TYPES
// ===================

export interface SendMessageResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

export interface OrderNotificationData {
    orderId: string;
    buyerPhone: string;
    buyerName?: string;
    vendorPhone?: string;
    storeName: string;
    totalAmountKobo: number;
    items: Array<{
        productName: string;
        quantity: number;
        unitPriceKobo: number;
    }>;
}

// ===================
// WHATSAPP API CLIENT
// ===================

/**
 * Send a WhatsApp template message via Meta Cloud API
 * 
 * CRITICAL: This function NEVER throws. All errors are logged and returned.
 * This ensures order state transitions are never blocked by WhatsApp failures.
 */
async function sendTemplateMessage(
    recipientPhone: string,
    templateName: string,
    templateVariables: string[]
): Promise<SendMessageResult> {
    const config = getWhatsAppConfig();

    // Check if WhatsApp is configured
    if (!config.apiToken || !config.phoneNumberId) {
        logger.warn({
            templateName,
            recipientPhone: recipientPhone.slice(-4),
        }, 'WhatsApp not configured - skipping message');

        return {
            success: false,
            error: 'WhatsApp not configured',
        };
    }

    // Format phone number (ensure it has country code, remove +)
    const formattedPhone = recipientPhone.replace(/^\+/, '').replace(/\s/g, '');

    const url = `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`;

    const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
            name: templateName,
            language: {
                code: 'en',
            },
            components: [
                {
                    type: 'body',
                    parameters: templateVariables.map(text => ({
                        type: 'text',
                        text,
                    })),
                },
            ],
        },
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json() as any;

        if (!response.ok) {
            logger.error({
                templateName,
                recipientPhone: formattedPhone.slice(-4),
                status: response.status,
                error: data.error?.message || 'Unknown error',
            }, 'WhatsApp API error');

            return {
                success: false,
                error: data.error?.message || `HTTP ${response.status}`,
            };
        }

        const messageId = data.messages?.[0]?.id;

        logger.info({
            templateName,
            recipientPhone: formattedPhone.slice(-4),
            messageId,
        }, 'WhatsApp message sent');

        return {
            success: true,
            messageId,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error({
            templateName,
            recipientPhone: formattedPhone.slice(-4),
            error: errorMessage,
        }, 'WhatsApp send failed');

        return {
            success: false,
            error: errorMessage,
        };
    }
}

// ===================
// MESSAGE LOGGING
// ===================

/**
 * Log a message send attempt to the database
 */
async function logMessageAttempt(
    prisma: PrismaClient,
    orderId: string,
    recipientPhone: string,
    templateName: string,
    result: SendMessageResult
): Promise<void> {
    try {
        await prisma.messageLog.create({
            data: {
                orderId,
                recipientPhone,
                templateName,
                status: result.success ? MessageStatus.SENT : MessageStatus.FAILED,
                providerMessageId: result.messageId || null,
                errorMessage: result.error || null,
                sentAt: result.success ? new Date() : null,
            },
        });
    } catch (error) {
        // Don't let logging failure break the flow
        logger.error({
            orderId,
            templateName,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to log message attempt');
    }
}

// ===================
// NOTIFICATION FUNCTIONS
// ===================

/**
 * Format currency amount from kobo to Naira string
 */
function formatNaira(amountKobo: number): string {
    return (amountKobo / 100).toLocaleString('en-NG', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

/**
 * Format items list for message
 */
function formatItemsSummary(items: OrderNotificationData['items']): string {
    return items
        .map(item => `${item.quantity}x ${item.productName}`)
        .join(', ');
}

/**
 * Send buyer payment confirmation message
 * 
 * Template: buyer_payment_confirmed
 * Variables: buyer_name, amount, order_id, store_name
 */
export async function sendBuyerPaymentConfirmed(
    prisma: PrismaClient,
    data: OrderNotificationData
): Promise<SendMessageResult> {
    const config = getWhatsAppConfig();
    const templateName = config.templates.buyerPaymentConfirmed;

    const variables = [
        data.buyerName || 'Customer',
        formatNaira(data.totalAmountKobo),
        data.orderId.slice(0, 8).toUpperCase(),
        data.storeName,
    ];

    const result = await sendTemplateMessage(
        data.buyerPhone,
        templateName,
        variables
    );

    await logMessageAttempt(prisma, data.orderId, data.buyerPhone, templateName, result);

    return result;
}

/**
 * Send vendor new order alert
 * 
 * Template: vendor_new_order
 * Variables: buyer_name, order_id, amount, items_summary, buyer_phone
 */
export async function sendVendorNewOrder(
    prisma: PrismaClient,
    data: OrderNotificationData
): Promise<SendMessageResult> {
    if (!data.vendorPhone) {
        logger.warn({
            orderId: data.orderId,
        }, 'No vendor phone - skipping vendor notification');

        return {
            success: false,
            error: 'No vendor phone number',
        };
    }

    const config = getWhatsAppConfig();
    const templateName = config.templates.vendorNewOrder;

    const variables = [
        data.buyerName || 'Customer',
        data.orderId.slice(0, 8).toUpperCase(),
        formatNaira(data.totalAmountKobo),
        formatItemsSummary(data.items),
        data.buyerPhone,
    ];

    const result = await sendTemplateMessage(
        data.vendorPhone,
        templateName,
        variables
    );

    await logMessageAttempt(prisma, data.orderId, data.vendorPhone, templateName, result);

    return result;
}

/**
 * Send buyer order fulfilled message
 * 
 * Template: buyer_order_fulfilled
 * Variables: buyer_name, order_id, store_name
 */
export async function sendBuyerOrderFulfilled(
    prisma: PrismaClient,
    data: OrderNotificationData
): Promise<SendMessageResult> {
    const config = getWhatsAppConfig();
    const templateName = config.templates.buyerOrderFulfilled;

    const variables = [
        data.buyerName || 'Customer',
        data.orderId.slice(0, 8).toUpperCase(),
        data.storeName,
    ];

    const result = await sendTemplateMessage(
        data.buyerPhone,
        templateName,
        variables
    );

    await logMessageAttempt(prisma, data.orderId, data.buyerPhone, templateName, result);

    return result;
}
