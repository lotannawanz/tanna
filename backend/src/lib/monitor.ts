import { PrismaClient, JobStatus } from '@prisma/client';
import { createLogger } from './logger.js';

const logger = createLogger('monitor');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Send a Slack alert. Falls back to logging if no webhook URL configured.
 */
async function sendAlert(
    severity: 'warning' | 'critical',
    message: string,
    details: Record<string, unknown> = {}
): Promise<void> {
    const emoji = severity === 'critical' ? '🚨' : '⚠️';
    const fullMessage = `${emoji} *Tanna Alert* [${severity.toUpperCase()}]\n${message}`;

    logger[severity === 'critical' ? 'error' : 'warn'](details, message);

    if (!SLACK_WEBHOOK_URL) return;

    try {
        await fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: fullMessage,
                blocks: [
                    { type: 'section', text: { type: 'mrkdwn', text: fullMessage } },
                    { type: 'section', text: { type: 'mrkdwn', text: '```' + JSON.stringify(details, null, 2) + '```' } },
                ],
            }),
        });
    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown',
        }, 'Failed to send Slack alert');
    }
}

/**
 * Run all monitoring checks. Called periodically by the worker.
 */
export async function runMonitoringChecks(prisma: PrismaClient): Promise<void> {
    await checkDeadJobs(prisma);
    await checkStuckProcessing(prisma);
    await checkUnprocessedWebhooks(prisma);
    await checkWorkerHeartbeat(prisma);
}

/**
 * Dead jobs created in the last 10 minutes → CRITICAL alert.
 */
async function checkDeadJobs(prisma: PrismaClient): Promise<void> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const deadJobs = await prisma.job.findMany({
        where: {
            status: JobStatus.DEAD,
            createdAt: { gte: tenMinutesAgo },
        },
        select: { id: true, type: true, lastError: true, createdAt: true },
    });

    if (deadJobs.length > 0) {
        await sendAlert('critical', `${deadJobs.length} dead job(s) in last 10 minutes`, {
            jobs: deadJobs.map((j) => ({ id: j.id, type: j.type, error: j.lastError })),
        });
    }
}

/**
 * Jobs stuck in PROCESSING with lockedAt > 2 minutes ago → WARNING.
 */
async function checkStuckProcessing(prisma: PrismaClient): Promise<void> {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const stuckJobs = await prisma.job.findMany({
        where: {
            status: JobStatus.PROCESSING,
            lockedAt: { lt: twoMinutesAgo },
        },
        select: { id: true, type: true, lockedBy: true, lockedAt: true },
    });

    if (stuckJobs.length > 0) {
        await sendAlert('warning', `${stuckJobs.length} stuck PROCESSING job(s)`, {
            jobs: stuckJobs.map((j) => ({
                id: j.id,
                type: j.type,
                lockedBy: j.lockedBy,
                lockedAt: j.lockedAt,
            })),
        });
    }
}

/**
 * Webhooks unprocessed for > 1 minute → WARNING.
 */
async function checkUnprocessedWebhooks(prisma: PrismaClient): Promise<void> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const count = await prisma.webhookEvent.count({
        where: {
            processedAt: null,
            createdAt: { lt: oneMinuteAgo },
        },
    });

    if (count > 0) {
        await sendAlert('warning', `${count} unprocessed webhook(s) older than 1 minute`, {
            count,
        });
    }
}

/**
 * Worker heartbeat stale for > 90 seconds → CRITICAL.
 */
async function checkWorkerHeartbeat(prisma: PrismaClient): Promise<void> {
    const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);

    const workerHealth = await prisma.systemHealth.findUnique({
        where: { component: 'tanna-worker' },
    });

    if (!workerHealth) {
        // Worker has never started — only alert if there are pending jobs
        const pendingCount = await prisma.job.count({
            where: { status: JobStatus.PENDING },
        });
        if (pendingCount > 0) {
            await sendAlert('critical', 'Worker has never started and there are pending jobs', {
                pendingCount,
            });
        }
        return;
    }

    if (workerHealth.lastHeartbeat < ninetySecondsAgo) {
        await sendAlert('critical', 'Worker heartbeat stale (>90 seconds)', {
            lastHeartbeat: workerHealth.lastHeartbeat.toISOString(),
            metadata: workerHealth.metadata,
        });
    }
}
