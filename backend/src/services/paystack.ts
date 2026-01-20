import { createHmac } from 'crypto';
import { env } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('paystack');

// ===================
// TYPES
// ===================

export interface PaystackInitializeRequest {
    email: string;
    amount: number;  // In kobo
    reference: string;
    currency?: string;
    metadata?: Record<string, unknown>;
    callback_url?: string;
}

export interface PaystackInitializeResponse {
    status: boolean;
    message: string;
    data: {
        authorization_url: string;
        access_code: string;
        reference: string;
    };
}

export interface PaystackWebhookEvent {
    event: string;
    data: {
        id: number;
        reference: string;
        amount: number;
        currency: string;
        status: string;
        gateway_response: string;
        paid_at?: string;
        metadata?: Record<string, unknown>;
        customer?: {
            email: string;
        };
    };
}

// ===================
// SIGNATURE VERIFICATION
// ===================

/**
 * Verify Paystack webhook signature using HMAC SHA512
 * 
 * This is the FIRST line of defense - no processing happens without valid signature
 */
export function verifyPaystackSignature(
    payload: string,
    signature: string
): boolean {
    const expectedSignature = createHmac('sha512', env.PAYSTACK_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

    const isValid = expectedSignature === signature;

    if (!isValid) {
        logger.warn({
            receivedSignature: signature.substring(0, 20) + '...',
        }, 'Invalid Paystack signature received');
    }

    return isValid;
}

// ===================
// API CLIENT
// ===================

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Initialize a Paystack transaction
 * 
 * This creates a payment session on Paystack's side
 * Returns an authorization URL for redirect
 */
export async function initializePaystackTransaction(
    request: PaystackInitializeRequest
): Promise<PaystackInitializeResponse> {
    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: request.email,
            amount: request.amount,
            reference: request.reference,
            currency: request.currency || 'NGN',
            metadata: request.metadata,
            callback_url: request.callback_url,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error({
            status: response.status,
            error: errorText,
            reference: request.reference,
        }, 'Paystack initialization failed');

        throw new Error(`Paystack initialization failed: ${response.status}`);
    }

    const data = await response.json() as PaystackInitializeResponse;

    logger.info({
        reference: request.reference,
        accessCode: data.data.access_code,
    }, 'Paystack transaction initialized');

    return data;
}

/**
 * Verify a Paystack transaction directly via API
 * 
 * This is a BACKUP mechanism - webhook is the source of truth
 * Use only for manual reconciliation or when webhook fails
 */
export async function verifyPaystackTransaction(
    reference: string
): Promise<PaystackWebhookEvent['data'] | null> {
    try {
        const response = await fetch(
            `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                },
            }
        );

        if (!response.ok) {
            logger.warn({
                status: response.status,
                reference,
            }, 'Paystack verification request failed');
            return null;
        }

        const data = await response.json() as { status: boolean; data: PaystackWebhookEvent['data'] };

        if (!data.status) {
            return null;
        }

        return data.data;
    } catch (error) {
        logger.error({
            reference,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Paystack verification error');

        return null;
    }
}

/**
 * Parse Paystack event type to determine outcome
 */
export function parsePaystackEventOutcome(
    event: PaystackWebhookEvent
): 'success' | 'failed' | 'unknown' {
    switch (event.event) {
        case 'charge.success':
            return 'success';
        case 'charge.failed':
            return 'failed';
        default:
            return 'unknown';
    }
}
