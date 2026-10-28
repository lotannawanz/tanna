import { PrismaClient, JobStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import { createLogger } from './logger.js';
import { getErrorRate } from './api-metrics.js';
import os from 'os';

const logger = createLogger('monitor');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const PAGERDUTY_WEBHOOK_URL = process.env.PAGERDUTY_WEBHOOK_URL;

// ===================
// ALERT THRESHOLDS
// ===================

const THRESHOLDS = {
    // ----- Application-level -----
    DEAD_JOBS_WARNING: 1,               // Any dead job is notable
    DEAD_JOBS_CRITICAL: 3,              // ≥3 dead jobs = something systemic
    STUCK_PROCESSING_MINUTES: 2,        // Jobs stuck > 2 min
    UNPROCESSED_WEBHOOKS_WARNING_SECONDS: 60,   // Webhooks > 60s → WARNING
    UNPROCESSED_WEBHOOKS_CRITICAL_SECONDS: 120, // Webhooks > 120s → CRITICAL (money system)
    WORKER_HEARTBEAT_STALE_SECONDS: 90,
    FAILED_JOBS_WINDOW_MINUTES: 10,
    FAILED_JOBS_WARNING: 3,
    FAILED_JOBS_CRITICAL: 5,

    // Queue depth
    QUEUE_DEPTH_WARNING: 50,            // >50 pending jobs
    QUEUE_DEPTH_CRITICAL: 100,          // >100 pending jobs
    QUEUE_DEPTH_DURATION_MS: 120_000,   // Must persist for 2 min

    // API error rate
    API_5XX_WARNING_PERCENT: 3,         // >3% over 5 min
    API_5XX_WARNING_WINDOW_MINUTES: 5,
    API_5XX_CRITICAL_PERCENT: 7,        // >7% over 3 min
    API_5XX_CRITICAL_WINDOW_MINUTES: 3,

    // ----- Business logic -----
    // Payment-to-confirmation ratio: should be 1.0
    // If >0 payments are verified but orders not confirmed → something broke
    PAYMENT_CONFIRMATION_LAG_WARNING_SECONDS: 60,  // Median lag > 60s
    ORPHANED_PAYMENTS_CRITICAL: 1,      // Any verified payment without confirmed order

    // ----- System-level -----
    CPU_WARNING_PERCENT: 80,
    CPU_CRITICAL_PERCENT: 90,
    MEMORY_WARNING_PERCENT: 80,
    MEMORY_CRITICAL_PERCENT: 90,
    HEAP_WARNING_PERCENT: 85,
    HEAP_CRITICAL_PERCENT: 92,
};

// ===================
// QUEUE DEPTH STATE
// ===================

// Track when queue depth first exceeded threshold
let queueDepthExceededSince: number | null = null;

// ===================
// SEVERITY & ESCALATION
// ===================

type Severity = 'warning' | 'critical';

/**
 * WARNING → Slack only
 * CRITICAL → Slack + PagerDuty/Opsgenie
 */
async function sendAlert(
    severity: Severity,
    message: string,
    details: Record<string, unknown> = {}
): Promise<void> {
    const emoji = severity === 'critical' ? '🚨' : '⚠️';
    const fullMessage = `${emoji} *Tanna Alert* [${severity.toUpperCase()}]\n${message}`;

    logger[severity === 'critical' ? 'error' : 'warn'](details, message);

    if (SLACK_WEBHOOK_URL) {
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

    if (severity === 'critical' && PAGERDUTY_WEBHOOK_URL) {
        try {
            await fetch(PAGERDUTY_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    routing_key: process.env.PAGERDUTY_ROUTING_KEY || '',
                    event_action: 'trigger',
                    payload: {
                        summary: message,
                        severity: 'critical',
                        source: 'tanna-backend',
                        custom_details: details,
                    },
                }),
            });
        } catch (error) {
            logger.error({
                error: error instanceof Error ? error.message : 'Unknown',
            }, 'Failed to send PagerDuty alert');
        }
    }
}

// ===================
// MASTER CHECK RUNNER
// ===================

export async function runMonitoringChecks(prisma: PrismaClient): Promise<void> {
    // Infrastructure checks
    await checkDeadJobs(prisma);
    await checkStuckProcessing(prisma);
    await checkUnprocessedWebhooks(prisma);
    await checkWorkerHeartbeat(prisma);
    await checkJobFailureRate(prisma);
    await checkQueueDepth(prisma);
    await checkApiErrorRate();
    await checkSystemMetrics();

    // Business logic checks — the ones that actually matter
    await checkPaymentConfirmationRatio(prisma);
    await checkOrphanedPayments(prisma);
    await checkConfirmationLag(prisma);
}

// ===================
// INFRASTRUCTURE CHECKS
// ===================

/**
 * Dead jobs: ≥1 → WARNING, ≥3 → CRITICAL
 * Downgraded from immediate CRITICAL because replay is deterministic.
 */
async function checkDeadJobs(prisma: PrismaClient): Promise<void> {
    const windowStart = new Date(Date.now() - THRESHOLDS.FAILED_JOBS_WINDOW_MINUTES * 60 * 1000);

    const deadJobs = await prisma.job.findMany({
        where: {
            status: JobStatus.DEAD,
            createdAt: { gte: windowStart },
        },
        select: { id: true, type: true, lastError: true, createdAt: true },
    });

    if (deadJobs.length >= THRESHOLDS.DEAD_JOBS_CRITICAL) {
        await sendAlert('critical', `${deadJobs.length} dead job(s) in last ${THRESHOLDS.FAILED_JOBS_WINDOW_MINUTES}min — systemic failure`, {
            threshold: THRESHOLDS.DEAD_JOBS_CRITICAL,
            jobs: deadJobs.map(j => ({ id: j.id, type: j.type, error: j.lastError })),
        });
    } else if (deadJobs.length >= THRESHOLDS.DEAD_JOBS_WARNING) {
        await sendAlert('warning', `${deadJobs.length} dead job(s) in last ${THRESHOLDS.FAILED_JOBS_WINDOW_MINUTES}min — check replay eligibility`, {
            threshold: THRESHOLDS.DEAD_JOBS_WARNING,
            jobs: deadJobs.map(j => ({ id: j.id, type: j.type, error: j.lastError })),
        });
    }
}

async function checkStuckProcessing(prisma: PrismaClient): Promise<void> {
    const cutoff = new Date(Date.now() - THRESHOLDS.STUCK_PROCESSING_MINUTES * 60 * 1000);

    const stuckJobs = await prisma.job.findMany({
        where: { status: JobStatus.PROCESSING, lockedAt: { lt: cutoff } },
        select: { id: true, type: true, lockedBy: true, lockedAt: true },
    });

    if (stuckJobs.length > 0) {
        await sendAlert('warning', `${stuckJobs.length} stuck PROCESSING job(s) (>${THRESHOLDS.STUCK_PROCESSING_MINUTES}min)`, {
            jobs: stuckJobs.map(j => ({ id: j.id, type: j.type, lockedBy: j.lockedBy, lockedAt: j.lockedAt })),
        });
    }
}

/**
 * Unprocessed webhooks: >60s → WARNING, >120s → CRITICAL
 * Tightened because this is a money system — 2 min of silence feels broken.
 */
async function checkUnprocessedWebhooks(prisma: PrismaClient): Promise<void> {
    const criticalCutoff = new Date(Date.now() - THRESHOLDS.UNPROCESSED_WEBHOOKS_CRITICAL_SECONDS * 1000);
    const warningCutoff = new Date(Date.now() - THRESHOLDS.UNPROCESSED_WEBHOOKS_WARNING_SECONDS * 1000);

    const criticalCount = await prisma.webhookEvent.count({
        where: { processedAt: null, createdAt: { lt: criticalCutoff } },
    });

    if (criticalCount > 0) {
        await sendAlert('critical', `${criticalCount} unprocessed webhook(s) older than ${THRESHOLDS.UNPROCESSED_WEBHOOKS_CRITICAL_SECONDS}s — money at risk`, {
            count: criticalCount,
            thresholdSeconds: THRESHOLDS.UNPROCESSED_WEBHOOKS_CRITICAL_SECONDS,
        });
        return; // Don't double-alert
    }

    const warningCount = await prisma.webhookEvent.count({
        where: { processedAt: null, createdAt: { lt: warningCutoff } },
    });

    if (warningCount > 0) {
        await sendAlert('warning', `${warningCount} unprocessed webhook(s) older than ${THRESHOLDS.UNPROCESSED_WEBHOOKS_WARNING_SECONDS}s`, {
            count: warningCount,
        });
    }
}

async function checkWorkerHeartbeat(prisma: PrismaClient): Promise<void> {
    const cutoff = new Date(Date.now() - THRESHOLDS.WORKER_HEARTBEAT_STALE_SECONDS * 1000);

    const workerHealth = await prisma.systemHealth.findUnique({
        where: { component: 'tanna-worker' },
    });

    if (!workerHealth) {
        const pendingCount = await prisma.job.count({ where: { status: JobStatus.PENDING } });
        if (pendingCount > 0) {
            await sendAlert('critical', 'Worker has never started and there are pending jobs', { pendingCount });
        }
        return;
    }

    if (workerHealth.lastHeartbeat < cutoff) {
        await sendAlert('critical', `Worker heartbeat stale (>${THRESHOLDS.WORKER_HEARTBEAT_STALE_SECONDS}s)`, {
            lastHeartbeat: workerHealth.lastHeartbeat.toISOString(),
            metadata: workerHealth.metadata,
        });
    }
}

async function checkJobFailureRate(prisma: PrismaClient): Promise<void> {
    const windowStart = new Date(Date.now() - THRESHOLDS.FAILED_JOBS_WINDOW_MINUTES * 60 * 1000);

    const failedCount = await prisma.job.count({
        where: { status: JobStatus.FAILED, updatedAt: { gte: windowStart } },
    });

    if (failedCount >= THRESHOLDS.FAILED_JOBS_CRITICAL) {
        await sendAlert('critical', `${failedCount} job failures in last ${THRESHOLDS.FAILED_JOBS_WINDOW_MINUTES}min`, {
            failedCount, threshold: THRESHOLDS.FAILED_JOBS_CRITICAL,
        });
    } else if (failedCount >= THRESHOLDS.FAILED_JOBS_WARNING) {
        await sendAlert('warning', `${failedCount} job failures in last ${THRESHOLDS.FAILED_JOBS_WINDOW_MINUTES}min`, {
            failedCount, threshold: THRESHOLDS.FAILED_JOBS_WARNING,
        });
    }
}

/**
 * Queue depth: >50 for >2min → WARNING, >100 → CRITICAL (immediate)
 * Catches silent slowdowns before jobs start dying.
 */
async function checkQueueDepth(prisma: PrismaClient): Promise<void> {
    const pendingCount = await prisma.job.count({ where: { status: JobStatus.PENDING } });

    if (pendingCount >= THRESHOLDS.QUEUE_DEPTH_CRITICAL) {
        queueDepthExceededSince = null; // Reset — this is already critical
        await sendAlert('critical', `Queue depth critically high: ${pendingCount} pending jobs`, {
            pendingCount, threshold: THRESHOLDS.QUEUE_DEPTH_CRITICAL,
        });
        return;
    }

    if (pendingCount >= THRESHOLDS.QUEUE_DEPTH_WARNING) {
        const now = Date.now();
        if (!queueDepthExceededSince) {
            queueDepthExceededSince = now;
        } else if (now - queueDepthExceededSince >= THRESHOLDS.QUEUE_DEPTH_DURATION_MS) {
            await sendAlert('warning', `Queue depth elevated: ${pendingCount} pending jobs for >${THRESHOLDS.QUEUE_DEPTH_DURATION_MS / 1000}s`, {
                pendingCount,
                threshold: THRESHOLDS.QUEUE_DEPTH_WARNING,
                durationSeconds: Math.round((now - queueDepthExceededSince) / 1000),
            });
        }
    } else {
        queueDepthExceededSince = null; // Reset when below threshold
    }
}

/**
 * API 5xx error rate: >3% over 5min → WARNING, >7% over 3min → CRITICAL
 */
async function checkApiErrorRate(): Promise<void> {
    // Check critical first (shorter window, higher threshold)
    const critical = getErrorRate(THRESHOLDS.API_5XX_CRITICAL_WINDOW_MINUTES);
    if (critical.total > 10 && critical.errorRate >= THRESHOLDS.API_5XX_CRITICAL_PERCENT) {
        await sendAlert('critical', `API 5xx rate critically high: ${critical.errorRate.toFixed(1)}% over ${THRESHOLDS.API_5XX_CRITICAL_WINDOW_MINUTES}min`, {
            errorRate: `${critical.errorRate.toFixed(1)}%`,
            errors: critical.errors,
            totalRequests: critical.total,
            windowMinutes: THRESHOLDS.API_5XX_CRITICAL_WINDOW_MINUTES,
        });
        return;
    }

    // Check warning (longer window, lower threshold)
    const warning = getErrorRate(THRESHOLDS.API_5XX_WARNING_WINDOW_MINUTES);
    if (warning.total > 10 && warning.errorRate >= THRESHOLDS.API_5XX_WARNING_PERCENT) {
        await sendAlert('warning', `API 5xx rate elevated: ${warning.errorRate.toFixed(1)}% over ${THRESHOLDS.API_5XX_WARNING_WINDOW_MINUTES}min`, {
            errorRate: `${warning.errorRate.toFixed(1)}%`,
            errors: warning.errors,
            totalRequests: warning.total,
            windowMinutes: THRESHOLDS.API_5XX_WARNING_WINDOW_MINUTES,
        });
    }
}

// ===================
// BUSINESS LOGIC CHECKS
// ===================

/**
 * Payment-to-confirmation ratio.
 * 
 * Core business signal: for every successful Paystack payment,
 * there should be exactly 1 confirmed order.
 * 
 * If confirmed_orders / successful_payments ≠ 1.0, something is wrong.
 */
async function checkPaymentConfirmationRatio(prisma: PrismaClient): Promise<void> {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000); // Last 30 min

    const [confirmedPayments, confirmedOrders] = await Promise.all([
        prisma.payment.count({
            where: {
                status: PaymentStatus.CONFIRMED,
                verifiedAt: { gte: windowStart },
            },
        }),
        prisma.order.count({
            where: {
                status: { in: [OrderStatus.CONFIRMED, OrderStatus.FULFILLED] },
                confirmedAt: { gte: windowStart },
            },
        }),
    ]);

    // Only check if there's traffic
    if (confirmedPayments === 0 && confirmedOrders === 0) return;

    const ratio = confirmedPayments > 0
        ? confirmedOrders / confirmedPayments
        : confirmedOrders > 0 ? Infinity : 1;

    // Log the ratio every cycle for dashboards
    logger.info({
        confirmedPayments,
        confirmedOrders,
        ratio: ratio === Infinity ? 'Infinity' : ratio.toFixed(3),
        windowMinutes: 30,
    }, 'Business metric: payment-to-confirmation ratio');

    if (ratio !== 1 && (confirmedPayments > 0 || confirmedOrders > 0)) {
        const deviation = Math.abs(ratio - 1);
        if (deviation > 0.1 || ratio === Infinity) {
            await sendAlert('critical',
                `Payment-to-confirmation ratio deviated: ${confirmedOrders} confirmed orders / ${confirmedPayments} confirmed payments (ratio: ${ratio === Infinity ? '∞' : ratio.toFixed(3)})`,
                {
                    confirmedPayments,
                    confirmedOrders,
                    ratio: ratio === Infinity ? 'Infinity' : ratio.toFixed(3),
                    expectedRatio: 1.0,
                    windowMinutes: 30,
                }
            );
        }
    }
}

/**
 * Orphaned payments: verified payments without a confirmed order.
 * 
 * This should ALWAYS be 0. If it's not, the webhook or order
 * confirmation pipeline is broken.
 */
async function checkOrphanedPayments(prisma: PrismaClient): Promise<void> {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000);

    // Payments confirmed by Paystack but whose orders are still AWAITING_PAYMENT
    const orphaned = await prisma.payment.count({
        where: {
            status: PaymentStatus.CONFIRMED,
            verifiedAt: { gte: windowStart },
            order: {
                status: OrderStatus.AWAITING_PAYMENT,
            },
        },
    });

    if (orphaned >= THRESHOLDS.ORPHANED_PAYMENTS_CRITICAL) {
        await sendAlert('critical',
            `${orphaned} orphaned payment(s): payment confirmed but order still AWAITING_PAYMENT`,
            {
                orphanedCount: orphaned,
                windowMinutes: 30,
                action: 'Check webhook processing pipeline. These orders need manual confirmation.',
            }
        );
    }
}

/**
 * Median confirmation lag: time between payment verification and order confirmation.
 * 
 * If the median exceeds 60s, something is slow in the pipeline.
 */
async function checkConfirmationLag(prisma: PrismaClient): Promise<void> {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000);

    // Get recently confirmed orders with their payment verification times
    const recentOrders = await prisma.order.findMany({
        where: {
            status: { in: [OrderStatus.CONFIRMED, OrderStatus.FULFILLED] },
            confirmedAt: { gte: windowStart },
        },
        select: {
            confirmedAt: true,
            payment: {
                select: { verifiedAt: true },
            },
        },
        take: 100,
    });

    const lags = recentOrders
        .filter(o => o.confirmedAt && o.payment?.verifiedAt)
        .map(o => o.confirmedAt!.getTime() - o.payment!.verifiedAt!.getTime())
        .filter(lag => lag >= 0)
        .sort((a, b) => a - b);

    if (lags.length === 0) return;

    const medianLagMs = lags[Math.floor(lags.length / 2)];
    const medianLagSeconds = medianLagMs / 1000;
    const maxLagSeconds = lags[lags.length - 1] / 1000;

    // Log for dashboards
    logger.info({
        medianLagSeconds: medianLagSeconds.toFixed(1),
        maxLagSeconds: maxLagSeconds.toFixed(1),
        sampleSize: lags.length,
    }, 'Business metric: confirmation lag');

    if (medianLagSeconds > THRESHOLDS.PAYMENT_CONFIRMATION_LAG_WARNING_SECONDS) {
        await sendAlert('warning',
            `Median confirmation lag is ${medianLagSeconds.toFixed(1)}s (threshold: ${THRESHOLDS.PAYMENT_CONFIRMATION_LAG_WARNING_SECONDS}s)`,
            {
                medianLagSeconds: medianLagSeconds.toFixed(1),
                maxLagSeconds: maxLagSeconds.toFixed(1),
                sampleSize: lags.length,
                threshold: THRESHOLDS.PAYMENT_CONFIRMATION_LAG_WARNING_SECONDS,
            }
        );
    }
}

// ===================
// SYSTEM-LEVEL CHECKS
// ===================

async function checkSystemMetrics(): Promise<void> {
    // --- Memory ---
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemoryPercent = Math.round(((totalMemory - freeMemory) / totalMemory) * 100);

    if (usedMemoryPercent >= THRESHOLDS.MEMORY_CRITICAL_PERCENT) {
        await sendAlert('critical', `System memory critically high: ${usedMemoryPercent}%`, {
            usedMemoryPercent,
            totalMemoryMB: Math.round(totalMemory / 1024 / 1024),
            freeMemoryMB: Math.round(freeMemory / 1024 / 1024),
        });
    } else if (usedMemoryPercent >= THRESHOLDS.MEMORY_WARNING_PERCENT) {
        await sendAlert('warning', `System memory high: ${usedMemoryPercent}%`, {
            usedMemoryPercent,
            totalMemoryMB: Math.round(totalMemory / 1024 / 1024),
            freeMemoryMB: Math.round(freeMemory / 1024 / 1024),
        });
    }

    // --- Node.js heap: 85% WARNING, 92% CRITICAL ---
    const { heapUsed, heapTotal } = process.memoryUsage();
    const heapPercent = Math.round((heapUsed / heapTotal) * 100);

    if (heapPercent >= THRESHOLDS.HEAP_CRITICAL_PERCENT) {
        await sendAlert('critical', `Node.js heap critically high: ${heapPercent}% — GC thrash imminent`, {
            heapPercent,
            heapUsedMB: Math.round(heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(heapTotal / 1024 / 1024),
        });
    } else if (heapPercent >= THRESHOLDS.HEAP_WARNING_PERCENT) {
        await sendAlert('warning', `Node.js heap high: ${heapPercent}%`, {
            heapPercent,
            heapUsedMB: Math.round(heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(heapTotal / 1024 / 1024),
        });
    }

    // --- CPU ---
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuPercent = Math.round((loadAvg / cpuCount) * 100);

    if (cpuPercent >= THRESHOLDS.CPU_CRITICAL_PERCENT) {
        await sendAlert('critical', `CPU load critically high: ${cpuPercent}%`, {
            cpuPercent, loadAvg: loadAvg.toFixed(2), cpuCount,
        });
    } else if (cpuPercent >= THRESHOLDS.CPU_WARNING_PERCENT) {
        await sendAlert('warning', `CPU load high: ${cpuPercent}%`, {
            cpuPercent, loadAvg: loadAvg.toFixed(2), cpuCount,
        });
    }

    // Always log metrics snapshot for dashboards
    logger.info({
        usedMemoryPercent,
        heapPercent,
        cpuPercent,
        loadAvg: loadAvg.toFixed(2),
        uptimeSeconds: Math.round(process.uptime()),
    }, 'System metrics snapshot');
}

// ===================
// EXPORTS
// ===================

export { sendAlert, THRESHOLDS };
