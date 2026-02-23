import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { verifyPaystackSignature, PaystackWebhookEvent } from '../services/paystack.js';
import { storeWebhookEvent } from '../lib/idempotency.js';
import { enqueueJob } from '../lib/queue.js';
import { JobType } from '@prisma/client';

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
 * 2. Store raw payload in WebhookEvent (idempotency check)
 * 3. Enqueue WEBHOOK_PROCESS job
 * 4. Return 200 immediately (Paystack requirement)
 *
 * CRITICAL: No business logic runs inline. The worker handles processing.
 * This ensures the endpoint always responds fast and never blocks on
 * downstream failures (payment service, order service, WhatsApp).
 */
async function paystackWebhookHandler(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();

    // Get raw payload for signature verification
    const rawPayload = ((request as any).rawBody as string) || JSON.stringify(request.body);
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
            isRawBodyPresent: !!(request as any).rawBody,
            signatureReceived: signature,
        }, 'Paystack webhook signature verification failed');

        return reply.status(401).send({
            success: false,
            error: 'Invalid signature',
        });
    }

    // Parse the event
    const event = request.body as PaystackWebhookEvent;
    const eventId = `paystack_${event.data.id}`;

    // STEP 2: Store raw event (idempotency — rejects duplicates via unique constraint)
    const isNew = await storeWebhookEvent(prisma, {
        provider: 'paystack',
        eventId,
        eventType: event.event,
        rawPayload: event,
    });

    if (!isNew) {
        logger.info({ eventId }, 'Duplicate webhook event — skipped');
        return reply.status(200).send({ success: true, duplicate: true });
    }

    // STEP 3: Enqueue processing job (never process inline)
    await enqueueJob(prisma, {
        type: JobType.WEBHOOK_PROCESS,
        payload: { eventId, provider: 'paystack' },
    });

    logger.info({
        eventId,
        eventType: event.event,
        reference: event.data.reference,
    }, 'Webhook stored and job enqueued');

    // STEP 4: Return 200 immediately
    return reply.status(200).send({ success: true, enqueued: true });
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function webhooksRoutes(fastify: FastifyInstance) {
    // Manual content parser to capture raw body for signature verification
    fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string, done) => {
        try {
            const json = JSON.parse(body);
            (req as any).rawBody = body;
            done(null, json);
        } catch (err) {
            done(err as Error, undefined);
        }
    });

    // Paystack webhook endpoint
    fastify.post('/api/webhooks/paystack', paystackWebhookHandler);

    logger.debug('Webhook routes registered');
}
