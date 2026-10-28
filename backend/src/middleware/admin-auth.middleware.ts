import { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('admin-auth');

/**
 * Timing-safe string comparison.
 * Pads both strings to the same length to prevent length-based timing leaks.
 */
function safeCompare(expected: string, actual: string): boolean {
    const a = Buffer.from(expected.padEnd(64));
    const b = Buffer.from(actual.padEnd(64));
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Admin authentication middleware.
 *
 * 1. Checks ADMIN_DASHBOARD_ENABLED feature flag → 503 if disabled
 * 2. Checks x-admin-key header against ADMIN_API_KEY → 401 if missing/wrong
 * 3. Uses timing-safe comparison to prevent timing oracle attacks
 */
export async function adminAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Feature flag — allows safe deployment with routes registered but disabled
    if (!env.ADMIN_DASHBOARD_ENABLED) {
        return reply.status(503).send({
            success: false,
            error: 'Admin dashboard is disabled',
        });
    }

    // API key must be configured
    if (!env.ADMIN_API_KEY) {
        logger.error('ADMIN_DASHBOARD_ENABLED is true but ADMIN_API_KEY is not set');
        return reply.status(503).send({
            success: false,
            error: 'Admin dashboard is misconfigured',
        });
    }

    const providedKey = request.headers['x-admin-key'] as string | undefined;

    if (!providedKey) {
        logger.warn({ ip: request.ip }, 'Admin request missing x-admin-key header');
        return reply.status(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Missing x-admin-key header',
        });
    }

    if (!safeCompare(env.ADMIN_API_KEY, providedKey)) {
        logger.warn({ ip: request.ip }, 'Admin request with invalid API key');
        return reply.status(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid API key',
        });
    }

    logger.debug({ ip: request.ip, path: request.url }, 'Admin request authenticated');
}
