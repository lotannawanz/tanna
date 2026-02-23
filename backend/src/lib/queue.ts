import { PrismaClient, JobType, JobStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createLogger } from './logger.js';

const logger = createLogger('queue');

// Worker identity for lock ownership
const WORKER_ID = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
const STALE_LOCK_MINUTES = 5;

export interface EnqueueOptions {
    type: JobType;
    payload: Record<string, unknown>;
    maxRetries?: number;
    availableAt?: Date;
}

/**
 * Enqueue a job. Returns the job ID.
 */
export async function enqueueJob(
    prisma: PrismaClient,
    options: EnqueueOptions
): Promise<string> {
    const job = await prisma.job.create({
        data: {
            type: options.type,
            payload: options.payload as any,
            maxRetries: options.maxRetries ?? 5,
            availableAt: options.availableAt ?? new Date(),
        },
    });

    logger.info({
        jobId: job.id,
        type: job.type,
        availableAt: job.availableAt.toISOString(),
    }, 'Job enqueued');

    return job.id;
}

/**
 * Dequeue one job using SELECT ... FOR UPDATE SKIP LOCKED.
 *
 * This is a two-step process:
 * 1. SELECT one PENDING row with row-level lock (skips locked rows)
 * 2. UPDATE that row to PROCESSING with lock metadata
 *
 * Both in a single transaction. Returns null if no work available.
 *
 * Raw SQL is required because Prisma does not support FOR UPDATE SKIP LOCKED.
 * Without it, two concurrent poll iterations could grab the same job.
 * SKIP LOCKED ensures if one transaction holds a lock, the next query
 * skips it instead of waiting — no worker blocking.
 */
export async function dequeueJob(prisma: PrismaClient) {
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM jobs
            WHERE status = 'PENDING'
              AND available_at <= ${now}
            ORDER BY available_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `;

        if (rows.length === 0) return null;

        const jobId = rows[0].id;

        const job = await tx.job.update({
            where: { id: jobId },
            data: {
                status: JobStatus.PROCESSING,
                lockedAt: now,
                lockedBy: WORKER_ID,
            },
        });

        return job;
    });

    if (result) {
        logger.debug({ jobId: result.id, type: result.type }, 'Job dequeued');
    }

    return result;
}

/**
 * Mark a job as completed.
 */
export async function completeJob(
    prisma: PrismaClient,
    jobId: string
): Promise<void> {
    await prisma.job.update({
        where: { id: jobId },
        data: {
            status: JobStatus.COMPLETED,
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
        },
    });

    logger.info({ jobId }, 'Job completed');
}

/**
 * Mark a job as failed. If retries exhausted, mark as DEAD.
 * Uses exponential backoff: availableAt = now + 2^retryCount seconds.
 */
export async function failJob(
    prisma: PrismaClient,
    jobId: string,
    error: string
): Promise<void> {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    const newRetryCount = job.retryCount + 1;
    const isDead = newRetryCount >= job.maxRetries;

    if (isDead) {
        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: JobStatus.DEAD,
                retryCount: newRetryCount,
                lastError: error,
                lockedAt: null,
                lockedBy: null,
            },
        });

        logger.error({ jobId, type: job.type, retryCount: newRetryCount }, 'Job moved to DEAD');
    } else {
        const backoffSeconds = Math.pow(2, newRetryCount);
        const availableAt = new Date(Date.now() + backoffSeconds * 1000);

        await prisma.job.update({
            where: { id: jobId },
            data: {
                status: JobStatus.PENDING,
                retryCount: newRetryCount,
                lastError: error,
                availableAt,
                lockedAt: null,
                lockedBy: null,
            },
        });

        logger.warn({
            jobId,
            type: job.type,
            retryCount: newRetryCount,
            nextAttemptAt: availableAt.toISOString(),
        }, 'Job failed, scheduled for retry');
    }
}

/**
 * Recover stale locks — jobs stuck in PROCESSING for > STALE_LOCK_MINUTES.
 * Returns count of recovered jobs.
 */
export async function recoverStaleLocks(
    prisma: PrismaClient
): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_LOCK_MINUTES * 60 * 1000);

    const result = await prisma.job.updateMany({
        where: {
            status: JobStatus.PROCESSING,
            lockedAt: { lt: cutoff },
        },
        data: {
            status: JobStatus.PENDING,
            lockedAt: null,
            lockedBy: null,
        },
    });

    if (result.count > 0) {
        logger.warn({ count: result.count }, 'Recovered stale locked jobs');
    }

    return result.count;
}

export { WORKER_ID };
