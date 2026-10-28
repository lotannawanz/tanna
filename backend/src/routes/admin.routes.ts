import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { JobStatus, JobType, OrderStatus, PaymentStatus, StoreStatus } from '@prisma/client';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware.js';
import {
    listJobs,
    getJobById,
    retryJob,
    requeueJob,
    markJobDead,
    listWebhooks,
    getWebhookById,
    getOrderReconciliation,
    getSystemHealth,
} from '../services/admin.service.js';
import { confirmOrder } from '../services/order.service.js';
import { enqueueJob } from '../lib/queue.js';
import {
    renderSystemHealth,
    renderJobsList,
    renderJobDetail,
    renderWebhooksList,
    renderWebhookDetail,
    renderOrderDetail,
} from '../lib/admin-html.js';

const logger = createLogger('admin-routes');

// ===================
// QUERY SCHEMAS
// ===================

const emptyStringToUndefined = (val: unknown) => (val === '' ? undefined : val);

const jobsQuerySchema = z.object({
    status: z.preprocess(emptyStringToUndefined, z.nativeEnum(JobStatus).optional()),
    type: z.preprocess(emptyStringToUndefined, z.nativeEnum(JobType).optional()),
    retryCount: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(0).optional()),
    createdBefore: z.preprocess(emptyStringToUndefined, z.string().optional()),
    createdAfter: z.preprocess(emptyStringToUndefined, z.string().optional()),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.preprocess(emptyStringToUndefined, z.string().uuid().optional()),
    key: z.preprocess(emptyStringToUndefined, z.string().optional()), // Allow key via query for HTML nav
});

const webhooksQuerySchema = z.object({
    processed: z.preprocess(emptyStringToUndefined, z.enum(['true', 'false']).optional()),
    eventId: z.preprocess(emptyStringToUndefined, z.string().optional()),
    createdBefore: z.preprocess(emptyStringToUndefined, z.string().optional()),
    createdAfter: z.preprocess(emptyStringToUndefined, z.string().optional()),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.preprocess(emptyStringToUndefined, z.string().uuid().optional()),
    key: z.preprocess(emptyStringToUndefined, z.string().optional()),
});

const idParamSchema = z.object({
    id: z.string().uuid(),
});

// ===================
// HELPERS
// ===================

/**
 * Check if the client wants HTML (browser) or JSON (API).
 */
function wantsHtml(request: FastifyRequest): boolean {
    const accept = request.headers.accept || '';
    return accept.includes('text/html');
}

/**
 * Extract admin key from header or query param (for HTML navigation).
 */
function getAdminKey(request: FastifyRequest): string {
    return (request.headers['x-admin-key'] as string)
        || (request.query as Record<string, string>).key
        || '';
}

// ===================
// ROUTE HANDLERS
// ===================

// --- System Health ---

async function systemHealthHandler(request: FastifyRequest, reply: FastifyReply) {
    const prisma = getPrismaClient();
    const health = await getSystemHealth(prisma);

    if (wantsHtml(request)) {
        return reply.type('text/html').send(renderSystemHealth(health, getAdminKey(request)));
    }

    return reply.send({ success: true, data: health });
}

// --- Jobs ---

async function listJobsHandler(
    request: FastifyRequest<{ Querystring: z.infer<typeof jobsQuerySchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const query = jobsQuerySchema.parse(request.query);

    const result = await listJobs(prisma, {
        status: query.status,
        type: query.type,
        retryCount: query.retryCount,
        createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
        createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
    }, {
        limit: query.limit,
        cursor: query.cursor,
    });

    if (wantsHtml(request)) {
        return reply.type('text/html').send(renderJobsList(result, request.query as unknown as Record<string, string>, getAdminKey(request)));
    }

    return reply.send({ success: true, ...result });
}

async function getJobHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id } = idParamSchema.parse(request.params);

    const job = await getJobById(prisma, id);
    if (!job) {
        return reply.status(404).send({ success: false, error: 'Job not found' });
    }

    if (wantsHtml(request)) {
        return reply.type('text/html').send(renderJobDetail(job, getAdminKey(request)));
    }

    return reply.send({ success: true, data: job });
}

async function retryJobHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id } = idParamSchema.parse(request.params);

    const result = await retryJob(prisma, id);
    if ('error' in result) {
        return reply.status(result.status as number).send({ success: false, error: result.error });
    }

    // Redirect back to job detail if HTML
    if (wantsHtml(request)) {
        return reply.redirect(`/internal/admin/jobs/${id}?key=${encodeURIComponent(getAdminKey(request))}`);
    }

    return reply.send({ success: true, data: result.data });
}

async function requeueJobHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id } = idParamSchema.parse(request.params);

    const result = await requeueJob(prisma, id);
    if ('error' in result) {
        return reply.status(result.status as number).send({ success: false, error: result.error });
    }

    if (wantsHtml(request)) {
        return reply.redirect(`/internal/admin/jobs/${id}?key=${encodeURIComponent(getAdminKey(request))}`);
    }

    return reply.send({ success: true, data: result.data });
}

async function markJobDeadHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id } = idParamSchema.parse(request.params);

    const result = await markJobDead(prisma, id);
    if ('error' in result) {
        return reply.status(result.status as number).send({ success: false, error: result.error });
    }

    if (wantsHtml(request)) {
        return reply.redirect(`/internal/admin/jobs/${id}?key=${encodeURIComponent(getAdminKey(request))}`);
    }

    return reply.send({ success: true, data: result.data });
}

// --- Webhooks ---

async function listWebhooksHandler(
    request: FastifyRequest<{ Querystring: z.infer<typeof webhooksQuerySchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const query = webhooksQuerySchema.parse(request.query);

    const result = await listWebhooks(prisma, {
        processed: query.processed === 'true' ? true : query.processed === 'false' ? false : undefined,
        eventId: query.eventId,
        createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
        createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
    }, {
        limit: query.limit,
        cursor: query.cursor,
    });

    if (wantsHtml(request)) {
        return reply.type('text/html').send(renderWebhooksList(result, request.query as unknown as Record<string, string>, getAdminKey(request)));
    }

    return reply.send({ success: true, ...result });
}

async function getWebhookHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id } = idParamSchema.parse(request.params);

    const webhook = await getWebhookById(prisma, id);
    if (!webhook) {
        return reply.status(404).send({ success: false, error: 'Webhook not found' });
    }

    if (wantsHtml(request)) {
        return reply.type('text/html').send(renderWebhookDetail(webhook, getAdminKey(request)));
    }

    return reply.send({ success: true, data: webhook });
}

// --- Orders ---

async function getOrderReconciliationHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id } = idParamSchema.parse(request.params);

    const data = await getOrderReconciliation(prisma, id);
    if (!data) {
        return reply.status(404).send({ success: false, error: 'Order not found' });
    }

    if (wantsHtml(request)) {
        return reply.type('text/html').send(renderOrderDetail(data, getAdminKey(request)));
    }

    return reply.send({ success: true, data });
}

// --- Manual Payment Confirmation ---

async function adminConfirmPaymentHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id: orderId } = idParamSchema.parse(request.params);

    try {
        // Find the order
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { payment: true },
        });

        if (!order) {
            return reply.status(404).send({ success: false, error: 'Order not found' });
        }

        if (order.status !== OrderStatus.AWAITING_PAYMENT) {
            return reply.status(400).send({
                success: false,
                error: `Order is in ${order.status} state — can only confirm AWAITING_PAYMENT orders`,
            });
        }

        // Update payment to CONFIRMED
        if (order.payment) {
            await prisma.payment.update({
                where: { id: order.payment.id },
                data: {
                    status: PaymentStatus.CONFIRMED,
                    verifiedAt: new Date(),
                },
            });
        }

        // Confirm the order (triggers WhatsApp notifications via the event system)
        await confirmOrder(prisma, orderId);

        logger.info({ orderId, adminAction: 'manual_confirm' }, 'Order manually confirmed by admin');

        if (wantsHtml(request)) {
            return reply.redirect(`/internal/admin/orders/${orderId}?key=${encodeURIComponent(getAdminKey(request))}`);
        }

        return reply.send({ success: true, message: 'Order confirmed', orderId });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ orderId, error: msg }, 'Admin manual confirm failed');
        return reply.status(500).send({ success: false, error: msg });
    }
}

// --- Webhook Replay ---

async function adminReplayWebhookHandler(
    request: FastifyRequest<{ Params: z.infer<typeof idParamSchema> }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id: webhookId } = idParamSchema.parse(request.params);

    try {
        const webhook = await prisma.webhookEvent.findUnique({
            where: { id: webhookId },
        });

        if (!webhook) {
            return reply.status(404).send({ success: false, error: 'Webhook not found' });
        }

        // Clear processedAt so the handler treats it as unprocessed
        await prisma.webhookEvent.update({
            where: { id: webhookId },
            data: { processedAt: null },
        });

        // Re-enqueue the webhook processing job
        await enqueueJob(prisma, {
            type: JobType.WEBHOOK_PROCESS,
            payload: { eventId: webhook.eventId, provider: webhook.provider },
        });

        logger.info({ webhookId, eventId: webhook.eventId, adminAction: 'webhook_replay' }, 'Webhook replayed by admin');

        if (wantsHtml(request)) {
            return reply.redirect(`/internal/admin/webhooks/${webhookId}?key=${encodeURIComponent(getAdminKey(request))}`);
        }

        return reply.send({ success: true, message: 'Webhook replayed', webhookId, eventId: webhook.eventId });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ webhookId, error: msg }, 'Admin webhook replay failed');
        return reply.status(500).send({ success: false, error: msg });
    }
}

// --- Vendor Pause / Unpause ---

const vendorPauseSchema = z.object({
    status: z.nativeEnum(StoreStatus),
});

async function adminVendorPauseHandler(
    request: FastifyRequest<{
        Params: z.infer<typeof idParamSchema>;
        Body: z.infer<typeof vendorPauseSchema>;
    }>,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const { id: vendorId } = idParamSchema.parse(request.params);

    try {
        const parseResult = vendorPauseSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({ success: false, error: 'Invalid status', details: parseResult.error.errors });
        }

        const store = await prisma.store.findUnique({ where: { vendorId } });
        if (!store) {
            return reply.status(404).send({ success: false, error: 'Vendor store not found' });
        }

        const updated = await prisma.store.update({
            where: { vendorId },
            data: { status: parseResult.data.status },
        });

        logger.info({
            vendorId,
            storeId: updated.id,
            newStatus: updated.status,
            adminAction: 'vendor_pause',
        }, `Vendor store status changed to ${updated.status} by admin`);

        return reply.send({
            success: true,
            message: `Store status updated to ${updated.status}`,
            store: { id: updated.id, name: updated.name, status: updated.status },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ vendorId, error: msg }, 'Admin vendor pause failed');
        return reply.status(500).send({ success: false, error: msg });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function adminRoutes(fastify: FastifyInstance) {
    // Apply admin auth to all routes in this plugin
    // Also support API key via query param for HTML browser navigation
    fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
        // Allow key via query param for HTML form navigation
        const queryKey = (request.query as Record<string, string>).key;
        if (queryKey && !request.headers['x-admin-key']) {
            (request.headers as Record<string, string>)['x-admin-key'] = queryKey;
        }
        await adminAuthMiddleware(request, reply);
    });

    // System Health
    fastify.get('/internal/admin/system', systemHealthHandler);

    // Jobs
    fastify.get('/internal/admin/jobs', listJobsHandler);
    fastify.get('/internal/admin/jobs/:id', getJobHandler);
    fastify.post('/internal/admin/jobs/:id/retry', retryJobHandler);
    fastify.post('/internal/admin/jobs/:id/requeue', requeueJobHandler);
    fastify.post('/internal/admin/jobs/:id/mark-dead', markJobDeadHandler);

    // Webhooks
    fastify.get('/internal/admin/webhooks', listWebhooksHandler);
    fastify.get('/internal/admin/webhooks/:id', getWebhookHandler);

    // Orders
    fastify.get('/internal/admin/orders/:id', getOrderReconciliationHandler);
    fastify.post('/internal/admin/orders/:id/confirm', adminConfirmPaymentHandler);

    // Webhook replay
    fastify.post('/internal/admin/webhooks/:id/replay', adminReplayWebhookHandler);

    // Vendor management
    fastify.post('/internal/admin/vendors/:id/pause', adminVendorPauseHandler);

    logger.info('Admin dashboard routes registered (with manual confirm, replay, vendor pause)');
}
