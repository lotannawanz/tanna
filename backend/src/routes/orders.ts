import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import {
    getVendorOrders,
    getOrderById,
    fulfillOrder,
} from '../services/order.service.js';
import { authMiddleware, ownershipMiddleware } from '../middleware/auth.middleware.js';

const logger = createLogger('orders-route');

// ===================
// REQUEST SCHEMAS
// ===================

const vendorIdParamSchema = z.object({
    vendorId: z.string().uuid('Invalid vendor ID'),
});

const orderIdParamSchema = z.object({
    vendorId: z.string().uuid('Invalid vendor ID'),
    orderId: z.string().uuid('Invalid order ID'),
});

const listOrdersQuerySchema = z.object({
    status: z.nativeEnum(OrderStatus).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

// ===================
// ROUTE HANDLERS
// ===================

/**
 * GET /vendors/:vendorId/orders
 * 
 * List orders for a vendor with optional filters
 */
async function listVendorOrdersHandler(
    request: FastifyRequest<{
        Params: z.infer<typeof vendorIdParamSchema>;
        Querystring: z.infer<typeof listOrdersQuerySchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate params
        const paramsResult = vendorIdParamSchema.safeParse(request.params);
        if (!paramsResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid vendor ID',
                details: paramsResult.error.errors,
            });
        }

        // Validate query
        const queryResult = listOrdersQuerySchema.safeParse(request.query);
        if (!queryResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid query parameters',
                details: queryResult.error.errors,
            });
        }

        const { vendorId } = paramsResult.data;
        const { status, limit, offset } = queryResult.data;

        const prisma = getPrismaClient();

        // TODO: In production, verify caller is authorized for this vendorId
        // For now, we trust the vendorId from the URL

        const { orders, total } = await getVendorOrders(prisma, vendorId, {
            status,
            limit,
            offset,
        });

        logger.info({
            vendorId,
            status,
            limit,
            offset,
            resultCount: orders.length,
            total,
        }, 'Vendor orders listed');

        return reply.status(200).send({
            success: true,
            orders: orders.map(order => ({
                id: order.id,
                status: order.status,
                buyerPhone: order.buyerPhone,
                buyerEmail: order.buyerEmail,
                totalAmountKobo: order.totalAmountKobo,
                itemCount: order.items.length,
                createdAt: order.createdAt,
                confirmedAt: order.confirmedAt,
                fulfilledAt: order.fulfilledAt,
                paymentRef: order.payment?.internalRef || null,
            })),
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + orders.length < total,
            },
        });
    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        }, 'Failed to list vendor orders');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * GET /vendors/:vendorId/orders/:orderId
 * 
 * Get detailed order information
 */
async function getVendorOrderHandler(
    request: FastifyRequest<{
        Params: z.infer<typeof orderIdParamSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate params
        const paramsResult = orderIdParamSchema.safeParse(request.params);
        if (!paramsResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid parameters',
                details: paramsResult.error.errors,
            });
        }

        const { vendorId, orderId } = paramsResult.data;
        const prisma = getPrismaClient();

        const order = await getOrderById(prisma, orderId);

        if (!order) {
            return reply.status(404).send({
                success: false,
                error: 'Order not found',
            });
        }

        // Security: Verify vendor owns this order
        if (order.vendorId !== vendorId) {
            return reply.status(403).send({
                success: false,
                error: 'Forbidden: Order does not belong to this vendor',
            });
        }

        logger.info({ vendorId, orderId }, 'Vendor order detail retrieved');

        return reply.status(200).send({
            success: true,
            order: {
                id: order.id,
                status: order.status,
                buyerPhone: order.buyerPhone,
                buyerEmail: order.buyerEmail,
                totalAmountKobo: order.totalAmountKobo,
                createdAt: order.createdAt,
                confirmedAt: order.confirmedAt,
                fulfilledAt: order.fulfilledAt,
                items: order.items.map(item => ({
                    id: item.id,
                    productId: item.originalProductId,
                    productName: item.productName,
                    unitPriceKobo: item.unitPriceKobo,
                    quantity: item.quantity,
                    subtotalKobo: item.unitPriceKobo * item.quantity,
                })),
                payment: order.payment ? {
                    id: order.payment.id,
                    status: order.payment.status,
                    internalRef: order.payment.internalRef,
                    paystackRef: order.payment.paystackRef,
                } : null,
            },
        });
    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        }, 'Failed to get vendor order');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * POST /vendors/:vendorId/orders/:orderId/fulfill
 * 
 * Mark an order as fulfilled
 */
async function fulfillOrderHandler(
    request: FastifyRequest<{
        Params: z.infer<typeof orderIdParamSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate params
        const paramsResult = orderIdParamSchema.safeParse(request.params);
        if (!paramsResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid parameters',
                details: paramsResult.error.errors,
            });
        }

        const { vendorId, orderId } = paramsResult.data;
        const prisma = getPrismaClient();

        await fulfillOrder(prisma, orderId, vendorId);

        logger.info({ vendorId, orderId }, 'Order fulfilled via API');

        return reply.status(200).send({
            success: true,
            message: 'Order marked as fulfilled',
            fulfilledAt: new Date().toISOString(),
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Handle specific error cases
        if (errorMessage.includes('not found')) {
            return reply.status(404).send({
                success: false,
                error: 'Order not found',
            });
        }

        if (errorMessage.includes('Unauthorized')) {
            return reply.status(403).send({
                success: false,
                error: 'Forbidden: Order does not belong to this vendor',
            });
        }

        if (errorMessage.includes('Invalid order status transition')) {
            return reply.status(400).send({
                success: false,
                error: 'Order cannot be fulfilled in its current state',
                message: 'Only CONFIRMED orders can be marked as fulfilled',
            });
        }

        logger.error({
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
        }, 'Failed to fulfill order');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function ordersRoutes(fastify: FastifyInstance) {
    // Apply auth and ownership middleware to all vendor routes
    fastify.addHook('onRequest', authMiddleware);
    fastify.addHook('onRequest', ownershipMiddleware);

    // List vendor orders
    fastify.get('/api/vendors/:vendorId/orders', listVendorOrdersHandler);

    // Get vendor order detail
    fastify.get('/api/vendors/:vendorId/orders/:orderId', getVendorOrderHandler);

    // Mark order as fulfilled
    fastify.post('/api/vendors/:vendorId/orders/:orderId/fulfill', fulfillOrderHandler);

    logger.debug('Orders routes registered with auth middleware');
}
