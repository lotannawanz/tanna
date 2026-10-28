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
import { authMiddleware } from '../middleware/auth.middleware.js';

const logger = createLogger('orders-route');

// ===================
// REQUEST SCHEMAS
// ===================

const orderIdParamSchema = z.object({
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
 * GET /api/orders
 * 
 * List orders for the authenticated vendor (derived from JWT).
 */
async function listVendorOrdersHandler(
    request: FastifyRequest<{
        Querystring: z.infer<typeof listOrdersQuerySchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate query
        const queryResult = listOrdersQuerySchema.safeParse(request.query);
        if (!queryResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid query parameters',
                details: queryResult.error.errors,
            });
        }

        const vendorId = request.vendorId!;
        const { status, limit, offset } = queryResult.data;

        const prisma = getPrismaClient();

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
 * GET /api/orders/:orderId
 * 
 * Get detailed order information for the authenticated vendor.
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

        const vendorId = request.vendorId!;
        const { orderId } = paramsResult.data;
        const prisma = getPrismaClient();

        const order = await getOrderById(prisma, orderId);

        if (!order) {
            return reply.status(404).send({
                success: false,
                error: 'Order not found',
            });
        }

        // Security: Verify vendor owns this order via JWT identity
        if (order.vendorId !== vendorId) {
            logger.warn({
                requestedOrderId: orderId,
                orderVendorId: order.vendorId,
                tokenVendorId: vendorId,
            }, 'Cross-vendor order access attempt blocked');

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
 * POST /api/orders/:orderId/fulfill
 * 
 * Mark an order as fulfilled (authenticated vendor only).
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

        const vendorId = request.vendorId!;
        const { orderId } = paramsResult.data;
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
    // Apply auth middleware — vendorId is derived from JWT, never from URL
    fastify.addHook('onRequest', authMiddleware);

    // List vendor orders (JWT-scoped)
    fastify.get('/api/orders', listVendorOrdersHandler);

    // Get vendor order detail (JWT-scoped)
    fastify.get('/api/orders/:orderId', getVendorOrderHandler);

    // Mark order as fulfilled (JWT-scoped)
    fastify.post('/api/orders/:orderId/fulfill', fulfillOrderHandler);

    logger.debug('Orders routes registered (JWT-scoped, no URL vendorId)');
}
