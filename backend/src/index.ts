import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
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
import { disconnectPrisma, getPrismaClient } from './lib/database.js';
import rawBody from 'fastify-raw-body';
import { registerNotificationHandlers } from './services/notification.handler.js';

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

    // Initialize database connection
    const prisma = getPrismaClient();

    // Make prisma available to routes
    fastify.decorate('prisma', prisma);

    // Register CORS for frontend access
    await fastify.register(cors, {
        origin: ['http://localhost:5173', 'http://localhost:3000'],
        credentials: true,
    });

    // Register raw body plugin for webhook signature verification
    await fastify.register(rawBody, {
        field: 'rawBody',
        global: false,
        encoding: 'utf8',
        runFirst: true,
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

    // EPIC 6: Register WhatsApp notification handlers
    registerNotificationHandlers();
    logger.info('WhatsApp notification handlers registered');

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
