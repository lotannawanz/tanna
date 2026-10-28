import { PrismaClient, JobStatus, JobType, Prisma } from '@prisma/client';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('admin-service');

// ===================
// TYPES
// ===================

export interface PaginationParams {
    limit: number;
    cursor?: string;
}

export interface JobFilters {
    status?: JobStatus;
    type?: JobType;
    retryCount?: number;
    createdBefore?: Date;
    createdAfter?: Date;
}

export interface WebhookFilters {
    processed?: boolean;
    eventId?: string;
    createdBefore?: Date;
    createdAfter?: Date;
}

export interface PaginatedResult<T> {
    data: T[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
}

// ===================
// JOB QUERIES
// ===================

/**
 * List jobs with filters and cursor-based pagination.
 * Excludes payload from list to avoid loading huge JSON blobs.
 */
export async function listJobs(
    prisma: PrismaClient,
    filters: JobFilters,
    pagination: PaginationParams
): Promise<PaginatedResult<Prisma.JobGetPayload<{ select: typeof JOB_LIST_SELECT }>>> {
    const where: Prisma.JobWhereInput = {};

    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.retryCount !== undefined) where.retryCount = filters.retryCount;
    if (filters.createdBefore || filters.createdAfter) {
        where.createdAt = {};
        if (filters.createdBefore) where.createdAt.lte = filters.createdBefore;
        if (filters.createdAfter) where.createdAt.gte = filters.createdAfter;
    }

    const total = await prisma.job.count({ where });

    const jobs = await prisma.job.findMany({
        where,
        select: JOB_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit + 1, // Fetch one extra to detect hasMore
        ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });

    const hasMore = jobs.length > pagination.limit;
    const data = hasMore ? jobs.slice(0, pagination.limit) : jobs;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore, total };
}

// Select fields for job list (no payload — too heavy for list views)
const JOB_LIST_SELECT = {
    id: true,
    type: true,
    status: true,
    retryCount: true,
    maxRetries: true,
    availableAt: true,
    lockedAt: true,
    lockedBy: true,
    lastError: true,
    createdAt: true,
    updatedAt: true,
} as const;

/**
 * Get full job detail including payload.
 */
export async function getJobById(prisma: PrismaClient, id: string) {
    return prisma.job.findUnique({ where: { id } });
}

/**
 * Retry a job: reset retryCount, set PENDING, availableAt=now().
 * Allowed from any non-PROCESSING status.
 */
export async function retryJob(prisma: PrismaClient, id: string) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return { error: 'Job not found', status: 404 };

    if (job.status === JobStatus.PROCESSING) {
        return { error: 'Cannot retry a job that is currently PROCESSING', status: 409 };
    }

    const updated = await prisma.job.update({
        where: { id },
        data: {
            status: JobStatus.PENDING,
            retryCount: 0,
            availableAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
        },
    });

    logger.info({ jobId: id, previousStatus: job.status }, 'Job retried via admin');
    return { data: updated };
}

/**
 * Requeue a job: same as retry but only from DEAD or FAILED status.
 */
export async function requeueJob(prisma: PrismaClient, id: string) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return { error: 'Job not found', status: 404 };

    if (job.status !== JobStatus.DEAD && job.status !== JobStatus.FAILED) {
        return {
            error: `Cannot requeue a job with status ${job.status}. Only DEAD or FAILED jobs can be requeued.`,
            status: 409,
        };
    }

    const updated = await prisma.job.update({
        where: { id },
        data: {
            status: JobStatus.PENDING,
            retryCount: 0,
            availableAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
        },
    });

    logger.info({ jobId: id, previousStatus: job.status }, 'Job requeued via admin');
    return { data: updated };
}

/**
 * Mark a job as DEAD. Cannot mark PROCESSING or already COMPLETED jobs.
 */
export async function markJobDead(prisma: PrismaClient, id: string) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return { error: 'Job not found', status: 404 };

    if (job.status === JobStatus.PROCESSING) {
        return { error: 'Cannot mark a PROCESSING job as dead', status: 409 };
    }
    if (job.status === JobStatus.COMPLETED) {
        return { error: 'Cannot mark a COMPLETED job as dead', status: 409 };
    }
    if (job.status === JobStatus.DEAD) {
        return { error: 'Job is already DEAD', status: 409 };
    }

    const updated = await prisma.job.update({
        where: { id },
        data: {
            status: JobStatus.DEAD,
            lockedAt: null,
            lockedBy: null,
        },
    });

    logger.info({ jobId: id, previousStatus: job.status }, 'Job marked dead via admin');
    return { data: updated };
}

// ===================
// WEBHOOK QUERIES
// ===================

const WEBHOOK_LIST_SELECT = {
    id: true,
    provider: true,
    eventId: true,
    eventType: true,
    processedAt: true,
    createdAt: true,
    // rawPayload excluded from list — too large
} as const;

/**
 * List webhooks with filters and cursor-based pagination.
 */
export async function listWebhooks(
    prisma: PrismaClient,
    filters: WebhookFilters,
    pagination: PaginationParams
): Promise<PaginatedResult<Prisma.WebhookEventGetPayload<{ select: typeof WEBHOOK_LIST_SELECT }>>> {
    const where: Prisma.WebhookEventWhereInput = {};

    if (filters.processed === true) where.processedAt = { not: null };
    if (filters.processed === false) where.processedAt = null;
    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.createdBefore || filters.createdAfter) {
        where.createdAt = {};
        if (filters.createdBefore) where.createdAt.lte = filters.createdBefore;
        if (filters.createdAfter) where.createdAt.gte = filters.createdAfter;
    }

    const total = await prisma.webhookEvent.count({ where });

    const webhooks = await prisma.webhookEvent.findMany({
        where,
        select: WEBHOOK_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit + 1,
        ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });

    const hasMore = webhooks.length > pagination.limit;
    const data = hasMore ? webhooks.slice(0, pagination.limit) : webhooks;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore, total };
}

/**
 * Get full webhook detail with rawPayload + linked job + related order.
 */
export async function getWebhookById(prisma: PrismaClient, id: string) {
    const webhook = await prisma.webhookEvent.findUnique({ where: { id } });
    if (!webhook) return null;

    // Find the linked WEBHOOK_PROCESS job via payload.eventId
    const linkedJob = await prisma.job.findFirst({
        where: {
            type: JobType.WEBHOOK_PROCESS,
            payload: {
                path: ['eventId'],
                equals: webhook.eventId,
            },
        },
        select: {
            id: true,
            status: true,
            retryCount: true,
            createdAt: true,
            completedAt: true,
            lastError: true,
        },
    });

    // Try to find related order via Paystack reference in rawPayload
    let relatedOrder = null;
    const rawPayload = webhook.rawPayload as Record<string, unknown>;
    const paystackData = rawPayload?.data as Record<string, unknown> | undefined;
    const reference = paystackData?.reference as string | undefined;

    if (reference) {
        const payment = await prisma.payment.findUnique({
            where: { paystackRef: reference },
            select: { id: true, order: { select: { id: true, status: true } } },
        });
        if (payment?.order) {
            relatedOrder = payment.order;
        }
    }

    return { ...webhook, linkedJob, relatedOrder };
}

// ===================
// ORDER RECONCILIATION
// ===================

/**
 * Full order reconciliation view.
 * Shows order + payment + items + associated jobs + notification logs.
 */
export async function getOrderReconciliation(prisma: PrismaClient, id: string) {
    const order = await prisma.order.findUnique({
        where: { id },
        include: {
            items: true,
            payment: true,
        },
    });

    if (!order) return null;

    // Find associated webhook processing jobs
    // These are WEBHOOK_PROCESS jobs whose payload references this order's payment
    let webhookJobs: Array<{ id: string; status: JobStatus; type: JobType; retryCount: number; createdAt: Date; completedAt: Date | null; lastError: string | null }> = [];
    if (order.payment?.paystackRef) {
        // Find the webhook event for this payment
        const webhookEvent = await prisma.webhookEvent.findFirst({
            where: {
                provider: 'paystack',
                rawPayload: {
                    path: ['data', 'reference'],
                    equals: order.payment.paystackRef,
                },
            },
            select: { eventId: true },
        });

        if (webhookEvent) {
            webhookJobs = await prisma.job.findMany({
                where: {
                    type: JobType.WEBHOOK_PROCESS,
                    payload: {
                        path: ['eventId'],
                        equals: webhookEvent.eventId,
                    },
                },
                select: {
                    id: true,
                    status: true,
                    type: true,
                    retryCount: true,
                    createdAt: true,
                    completedAt: true,
                    lastError: true,
                },
            });
        }
    }

    // Find notification jobs (SEND_WHATSAPP) for this order
    const notificationJobs = await prisma.job.findMany({
        where: {
            type: JobType.SEND_WHATSAPP,
            payload: {
                path: ['orderId'],
                equals: order.id,
            },
        },
        select: {
            id: true,
            status: true,
            type: true,
            retryCount: true,
            createdAt: true,
            completedAt: true,
            lastError: true,
        },
    });

    // Find message logs for this order
    const messageLogs = await prisma.messageLog.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'desc' },
    });

    return {
        order,
        payment: order.payment,
        items: order.items,
        webhookJobs,
        notificationJobs,
        messageLogs,
    };
}

// ===================
// SYSTEM HEALTH
// ===================

/**
 * Get system health overview.
 * Worker heartbeat + job counts by status + unprocessed webhooks + stuck jobs.
 */
export async function getSystemHealth(prisma: PrismaClient) {
    const now = new Date();
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    // Parallel queries for performance
    const [
        workerHealth,
        jobCountsByStatus,
        unprocessedWebhooksCount,
        stuckJobsCount,
    ] = await Promise.all([
        // Worker heartbeat
        prisma.systemHealth.findUnique({
            where: { component: 'tanna-worker' },
        }),

        // Job counts grouped by status
        prisma.job.groupBy({
            by: ['status'],
            _count: { _all: true },
        }),

        // Unprocessed webhooks older than 60 seconds
        prisma.webhookEvent.count({
            where: {
                processedAt: null,
                createdAt: { lt: sixtySecondsAgo },
            },
        }),

        // Stuck jobs (PROCESSING > 2 min)
        prisma.job.count({
            where: {
                status: JobStatus.PROCESSING,
                lockedAt: { lt: twoMinutesAgo },
            },
        }),
    ]);

    // Convert groupBy result to a keyed object
    const jobCounts: Record<string, number> = {
        PENDING: 0,
        PROCESSING: 0,
        COMPLETED: 0,
        FAILED: 0,
        DEAD: 0,
    };
    for (const row of jobCountsByStatus) {
        jobCounts[row.status] = row._count._all;
    }

    const isWorkerHealthy = workerHealth
        ? workerHealth.lastHeartbeat > new Date(now.getTime() - 90 * 1000)
        : false;

    return {
        timestamp: now.toISOString(),
        worker: {
            status: workerHealth ? (isWorkerHealthy ? 'HEALTHY' : 'STALE') : 'NEVER_STARTED',
            lastHeartbeat: workerHealth?.lastHeartbeat?.toISOString() ?? null,
            metadata: workerHealth?.metadata ?? null,
        },
        jobs: jobCounts,
        alerts: {
            unprocessedWebhooks: unprocessedWebhooksCount,
            stuckJobs: stuckJobsCount,
        },
    };
}
