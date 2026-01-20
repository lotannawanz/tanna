import { PrismaClient } from '@prisma/client';
import { createLogger } from './logger.js';

const logger = createLogger('database');

// Singleton Prisma client instance
let prisma: PrismaClient | null = null;

/**
 * Get the Prisma client instance
 * Creates a new instance if one doesn't exist
 */
export function getPrismaClient(): PrismaClient {
    if (!prisma) {
        prisma = new PrismaClient({
            log: [
                { level: 'query', emit: 'event' },
                { level: 'error', emit: 'stdout' },
                { level: 'warn', emit: 'stdout' },
            ],
        });



        logger.info('Prisma client initialized');
    }

    return prisma;
}

/**
 * Disconnect the Prisma client
 * Call this during shutdown
 */
export async function disconnectPrisma(): Promise<void> {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
        logger.info('Prisma client disconnected');
    }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseConnection(): Promise<boolean> {
    try {
        const client = getPrismaClient();
        await client.$queryRaw`SELECT 1`;
        return true;
    } catch (error) {
        logger.error({ error }, 'Database connection check failed');
        return false;
    }
}
