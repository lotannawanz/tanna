import { getPrismaClient, disconnectPrisma } from './lib/database.js';
import { createLogger } from './lib/logger.js';
import {
    dequeueJob,
    completeJob,
    failJob,
    recoverStaleLocks,
    WORKER_ID,
} from './lib/queue.js';
import { handleWebhookProcessJob } from './workers/handlers/webhook-process.handler.js';
import { handleSendWhatsappJob } from './workers/handlers/send-whatsapp.handler.js';
import { runMonitoringChecks } from './lib/monitor.js';
import { JobType } from '@prisma/client';

const logger = createLogger('worker');

const POLL_INTERVAL_MS = 500;
const STALE_LOCK_CHECK_INTERVAL_MS = 60_000;        // Every 1 minute
const HEARTBEAT_INTERVAL_MS = 30_000;                // Every 30 seconds
const MONITORING_INTERVAL_MS = 60_000;               // Every 1 minute

let isShuttingDown = false;

/**
 * Route a job to its handler based on type.
 */
async function processJob(
    job: { id: string; type: JobType; payload: unknown }
): Promise<void> {
    const prisma = getPrismaClient();

    switch (job.type) {
        case JobType.WEBHOOK_PROCESS:
            await handleWebhookProcessJob(prisma, job.payload as Record<string, unknown>);
            break;
        case JobType.SEND_WHATSAPP:
            await handleSendWhatsappJob(prisma, job.payload as Record<string, unknown>);
            break;
        default:
            throw new Error(`Unknown job type: ${job.type}`);
    }
}

/**
 * Main worker loop.
 *
 * Polls for PENDING jobs, processes them one at a time.
 * On dequeue failure (DB issue), backs off to avoid thundering retries.
 * The transaction commits BEFORE job execution — a crash mid-processing
 * leaves the job in PROCESSING, which stale lock recovery will reset.
 */
async function workerLoop(): Promise<void> {
    const prisma = getPrismaClient();

    logger.info({ workerId: WORKER_ID }, 'Worker started');

    while (!isShuttingDown) {
        try {
            const job = await dequeueJob(prisma);

            if (!job) {
                // No work available — sleep before next poll
                await sleep(POLL_INTERVAL_MS);
                continue;
            }

            try {
                await processJob(job);
                await completeJob(prisma, job.id);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error({
                    jobId: job.id,
                    type: job.type,
                    error: errorMessage,
                }, 'Job execution failed');
                await failJob(prisma, job.id, errorMessage);
            }
        } catch (error) {
            // Dequeue itself failed (DB connection issue, etc.)
            logger.error({
                error: error instanceof Error ? error.message : 'Unknown',
            }, 'Worker loop error');
            await sleep(POLL_INTERVAL_MS * 4);
        }
    }
}

/**
 * Periodic stale lock recovery.
 * Jobs stuck in PROCESSING for > 5 minutes are reset to PENDING.
 */
function startStaleLockRecovery(): NodeJS.Timeout {
    const prisma = getPrismaClient();
    return setInterval(async () => {
        try {
            await recoverStaleLocks(prisma);
        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : 'Unknown',
            }, 'Stale lock recovery failed');
        }
    }, STALE_LOCK_CHECK_INTERVAL_MS);
}

/**
 * Worker heartbeat — writes to SystemHealth every 30 seconds.
 * Monitoring checks for staleness (> 90 seconds).
 */
function startHeartbeat(): NodeJS.Timeout {
    const prisma = getPrismaClient();
    return setInterval(async () => {
        try {
            await prisma.systemHealth.upsert({
                where: { component: 'tanna-worker' },
                update: {
                    lastHeartbeat: new Date(),
                    metadata: { workerId: WORKER_ID },
                },
                create: {
                    component: 'tanna-worker',
                    lastHeartbeat: new Date(),
                    metadata: { workerId: WORKER_ID },
                },
            });
        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : 'Unknown',
            }, 'Heartbeat write failed');
        }
    }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Periodic monitoring checks (dead jobs, stuck processing, etc.).
 */
function startMonitoring(): NodeJS.Timeout {
    const prisma = getPrismaClient();
    return setInterval(async () => {
        try {
            await runMonitoringChecks(prisma);
        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : 'Unknown',
            }, 'Monitoring check failed');
        }
    }, MONITORING_INTERVAL_MS);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Graceful shutdown — allows current job to finish.
 */
async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Worker received shutdown signal');
    isShuttingDown = true;

    // Allow current job to finish (workerLoop will exit after current iteration)
    await sleep(2000);
    await disconnectPrisma();
    logger.info('Worker shut down gracefully');
    process.exit(0);
}

// Entry point
async function main(): Promise<void> {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    const heartbeatTimer = startHeartbeat();
    const staleLockTimer = startStaleLockRecovery();
    const monitoringTimer = startMonitoring();

    try {
        await workerLoop();
    } finally {
        clearInterval(heartbeatTimer);
        clearInterval(staleLockTimer);
        clearInterval(monitoringTimer);
    }
}

main().catch((err) => {
    logger.fatal({ err }, 'Worker crashed');
    process.exit(1);
});
