import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import crypto from 'crypto';
import { env, isLocal } from './config/env.js';
import { logger } from './lib/logger.js';
import { healthRoutes } from './routes/health.js';
import { paymentsRoutes } from './routes/payments.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { ordersRoutes } from './routes/orders.js';
import { authRoutes } from './routes/auth.js';
import { storeRoutes } from './routes/store.js';
import { publicRoutes } from './routes/public.routes.js';
import { productsRoutes } from './routes/products.js';
import { storeOverviewRoutes } from './routes/store-overview.js';
import { adminRoutes } from './routes/admin.routes.js';
import { disconnectPrisma, getPrismaClient } from './lib/database.js';
import { recordRequest } from './lib/api-metrics.js';

/**
 * Tanna Backend Server
 * 
 * Production-grade Fastify server with:
 * - Structured logging
 * - Graceful shutdown
 * - Health monitoring
 * - Database connection management
 * - Vendor authentication (Epic 1)
 * - WhatsApp notification handlers (Epic 6)
 */
async function main() {
    const fastify = Fastify({
        // Generate a unique request ID for every incoming request
        genReqId: () => `req-${crypto.randomBytes(8).toString('hex')}`,
        logger: {
            level: env.NODE_ENV === 'local' ? 'debug' : 'info',
            transport: env.NODE_ENV === 'local'
                ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'HH:MM:ss',
                        ignore: 'pid,hostname',
                    },
                }
                : undefined,
        },
    });

    // -----------------------------------------------
    // Request lifecycle hooks
    // -----------------------------------------------

    // Structured access log on every response + feed API metrics
    fastify.addHook('onResponse', (request, reply, done) => {
        recordRequest(reply.statusCode);
        request.log.info({
            requestId: request.id,
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTimeMs: reply.elapsedTime,
        }, 'request completed');
        done();
    });

    // Track 5xx errors for alerting
    fastify.addHook('onError', (request, reply, error, done) => {
        request.log.error({
            requestId: request.id,
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            errorMessage: error.message,
        }, '5xx error occurred');
        done();
    });

    // Initialize database connection
    const prisma = getPrismaClient();

    // Make prisma available to routes
    fastify.decorate('prisma', prisma);

    // Register CORS — strict in staging/production, permissive in local dev
    await fastify.register(cors, {
        origin: isLocal
            ? true
            : (env.FRONTEND_URL || false),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    // Global rate limiting — baseline protection
    await fastify.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
    });


    // Register routes
    await fastify.register(healthRoutes);
    await fastify.register(authRoutes);       // Epic 1: Auth
    await fastify.register(storeRoutes);      // Epic 1: Stores
    await fastify.register(paymentsRoutes);
    await fastify.register(webhooksRoutes);
    await fastify.register(ordersRoutes);
    await fastify.register(productsRoutes);  // Epic 2: Products
    await fastify.register(storeOverviewRoutes);  // Epic 8: Store overview
    await fastify.register(publicRoutes);  // Epic 3: Public product pages & checkout
    await fastify.register(adminRoutes);  // Internal admin dashboard



    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Received shutdown signal');

        try {
            await fastify.close();
            await disconnectPrisma();
            logger.info('Server closed gracefully');
            process.exit(0);
        } catch (err) {
            logger.error({ err }, 'Error during shutdown');
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Start server
    try {
        await fastify.listen({
            port: env.PORT,
            host: '0.0.0.0'
        });

        logger.info({
            port: env.PORT,
            environment: env.NODE_ENV,
        }, '🚀 Tanna backend started');

    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        process.exit(1);
    }
}

main();
