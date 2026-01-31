import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StoreStatus } from '@prisma/client';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const logger = createLogger('store-overview-route');

// ===================
// TYPES
// ===================

interface StoreOverview {
    store: {
        id: string;
        name: string;
        slug: string;
        status: StoreStatus;
        currency: string;
        createdAt: Date;
    };
    stats: {
        totalOrders: number;
        ordersToday: number;
        totalRevenueKobo: number;
        productCount: number;
        activeProductCount: number;
    };
}

// ===================
// ROUTE HANDLERS
// ===================

/**
 * GET /api/vendor/store/overview
 * 
 * Get store overview with computed statistics.
 * Requires authentication.
 */
async function getStoreOverviewHandler(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const prisma = getPrismaClient();
    const vendorId = request.vendorId!;

    try {
        // Get store with product count
        const store = await prisma.store.findUnique({
            where: { vendorId },
            include: {
                products: {
                    select: { id: true, status: true }
                }
            }
        });

        if (!store) {
            return reply.status(404).send({
                success: false,
                error: 'Store not found',
                message: 'You have not created a store yet',
            });
        }

        // Get today's date at midnight for filtering
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get order statistics
        // Only count CONFIRMED and FULFILLED orders for revenue
        const [totalOrdersResult, ordersTodayResult, revenueResult] = await Promise.all([
            // Total orders (all confirmed/fulfilled)
            prisma.order.count({
                where: {
                    vendorId,
                    status: { in: ['CONFIRMED', 'FULFILLED'] }
                }
            }),

            // Orders today
            prisma.order.count({
                where: {
                    vendorId,
                    status: { in: ['CONFIRMED', 'FULFILLED'] },
                    createdAt: { gte: today }
                }
            }),

            // Total revenue (sum of confirmed/fulfilled orders)
            prisma.order.aggregate({
                where: {
                    vendorId,
                    status: { in: ['CONFIRMED', 'FULFILLED'] }
                },
                _sum: {
                    totalAmountKobo: true
                }
            })
        ]);

        const overview: StoreOverview = {
            store: {
                id: store.id,
                name: store.name,
                slug: store.slug,
                status: store.status,
                currency: store.currency,
                createdAt: store.createdAt,
            },
            stats: {
                totalOrders: totalOrdersResult,
                ordersToday: ordersTodayResult,
                totalRevenueKobo: revenueResult._sum.totalAmountKobo || 0,
                productCount: store.products.length,
                activeProductCount: store.products.filter(p => p.status === 'ACTIVE').length,
            }
        };

        logger.info({
            vendorId,
            storeId: store.id,
            totalOrders: overview.stats.totalOrders,
            ordersToday: overview.stats.ordersToday,
        }, 'Store overview fetched');

        return reply.status(200).send({
            success: true,
            ...overview
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message, vendorId }, 'Failed to get store overview');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function storeOverviewRoutes(fastify: FastifyInstance) {
    // Apply auth middleware
    fastify.addHook('onRequest', authMiddleware);

    // Store overview
    fastify.get('/api/vendor/store/overview', getStoreOverviewHandler);

    logger.debug('Store overview routes registered');
}
