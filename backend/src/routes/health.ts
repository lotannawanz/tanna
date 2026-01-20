import { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { checkDatabaseConnection } from '../lib/database.js';

/**
 * Health check route
 * 
 * Returns system status for load balancers and monitoring
 */
export async function healthRoutes(fastify: FastifyInstance) {
    fastify.get('/health', async (_request, _reply) => {
        const dbHealthy = await checkDatabaseConnection();

        return {
            status: dbHealthy ? 'ok' : 'degraded',
            environment: env.NODE_ENV,
            timestamp: new Date().toISOString(),
            services: {
                database: dbHealthy ? 'connected' : 'disconnected',
            },
        };
    });
}
