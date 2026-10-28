/**
 * API Metrics Collector
 * 
 * Tracks request counts and error rates over sliding time windows.
 * Used by the monitoring system to detect 5xx spikes
 * and compute API error rates.
 */

interface MetricBucket {
    totalRequests: number;
    errorRequests: number;  // 5xx
    timestamp: number;
}

const BUCKET_DURATION_MS = 60_000;  // 1-minute buckets
const MAX_BUCKETS = 10;             // Keep 10 minutes of history

const buckets: MetricBucket[] = [];

function getCurrentBucket(): MetricBucket {
    const now = Date.now();
    const bucketStart = now - (now % BUCKET_DURATION_MS);

    if (buckets.length === 0 || buckets[buckets.length - 1].timestamp !== bucketStart) {
        const newBucket: MetricBucket = {
            totalRequests: 0,
            errorRequests: 0,
            timestamp: bucketStart,
        };
        buckets.push(newBucket);

        // Evict old buckets
        while (buckets.length > MAX_BUCKETS) {
            buckets.shift();
        }
    }

    return buckets[buckets.length - 1];
}

/**
 * Record a completed request. Called from the onResponse hook.
 */
export function recordRequest(statusCode: number): void {
    const bucket = getCurrentBucket();
    bucket.totalRequests++;
    if (statusCode >= 500) {
        bucket.errorRequests++;
    }
}

/**
 * Get the error rate over the last N minutes.
 * Returns { total, errors, errorRate } where errorRate is 0-100%.
 */
export function getErrorRate(windowMinutes: number): {
    total: number;
    errors: number;
    errorRate: number;
} {
    const cutoff = Date.now() - (windowMinutes * 60_000);
    let total = 0;
    let errors = 0;

    for (const bucket of buckets) {
        if (bucket.timestamp >= cutoff) {
            total += bucket.totalRequests;
            errors += bucket.errorRequests;
        }
    }

    return {
        total,
        errors,
        errorRate: total > 0 ? (errors / total) * 100 : 0,
    };
}
