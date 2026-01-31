import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { verifyPaystackSignature, PaystackWebhookEvent } from '../services/paystack.js';
import { handleWebhookIdempotently } from '../lib/idempotency.js';
import { processPaystackPaymentEvent } from '../services/payment.service.js';

const logger = createLogger('webhooks-route');

// ===================
// PAYSTACK WEBHOOK
// ===================

/**
 * POST /api/webhooks/paystack
 * 
 * Secure Paystack webhook listener.
 * 
 * Flow:
 * 1. Verify signature (reject if invalid)
 * 2. Store raw payload in WebhookEvent
 * 3. Check idempotency (skip if duplicate)
 * 4. Process event if new
 * 5. Return 200 immediately (Paystack requirement)
 * 
 * CRITICAL: This is the ONLY source of payment truth.
 * Redirect success does NOT confirm payment.
 */
async function paystackWebhookHandler(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();

    // Get raw payload for signature verification
    // Use the raw body string provided by fastify-raw-body plugin
    // This is CRITICAL because JSON.stringify() reorders keys and breaks signature match
    const rawPayload = (request.rawBody as string) || JSON.stringify(request.body);
    const signature = request.headers['x-paystack-signature'] as string;

    // STEP 1: Verify signature FIRST
    if (!signature) {
        logger.warn({
            ip: request.ip,
            headers: Object.keys(request.headers),
        }, 'Paystack webhook missing signature');

        return reply.status(401).send({
            success: false,
            error: 'Missing signature',
        });
    }

    if (!verifyPaystackSignature(rawPayload, signature)) {
        logger.error({
            ip: request.ip,
            rawPayloadLength: rawPayload ? rawPayload.length : 0,
            rawPayloadPreview: rawPayload ? rawPayload.substring(0, 50) : null,
            isRawBodyPresent: !!request.rawBody,
            signatureReceived: signature,
        }, 'Paystack webhook signature verification failed');

        return reply.status(401).send({
            success: false,
            error: 'Invalid signature',
        });
    }

    // Parse the event
    const event = request.body as PaystackWebhookEvent;

    // Extract event ID for idempotency
    // Paystack uses the transaction ID as the unique identifier
    const eventId = `paystack_${event.data.id}`;

    logger.info({
        eventId,
        eventType: event.event,
        reference: event.data.reference,
    }, 'Paystack webhook received');

    // STEP 2-4: Store and process idempotently
    const result = await handleWebhookIdempotently(
        prisma,
        {
            provider: 'paystack',
            eventId,
            eventType: event.event,
            rawPayload: event,
        },
        async () => {
            // Process the payment event
            const verificationResult = await processPaystackPaymentEvent(prisma, event);

            logger.info({
                eventId,
                paymentId: verificationResult.paymentId,
                status: verificationResult.status,
                reason: verificationResult.reason,
            }, 'Paystack event processed');
        }
    );

    // Log the outcome
    if (!result.isNew) {
        logger.info({ eventId }, 'Duplicate webhook event ignored');
    } else if (!result.processed) {
        logger.error({
            eventId,
            error: result.error,
        }, 'Webhook processing failed');
    }

    // STEP 5: Always return 200 to Paystack
    // Even if processing fails, we've stored the raw payload for retry
    return reply.status(200).send({
        success: true,
        isNew: result.isNew,
        processed: result.processed,
    });
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function webhooksRoutes(fastify: FastifyInstance) {
    // Paystack webhook endpoint
    // Paystack webhook endpoint
    fastify.post('/api/webhooks/paystack', {
        config: {
            rawBody: true
        }
    }, paystackWebhookHandler);

    logger.debug('Webhook routes registered');
}
