import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';
import { createLogger } from '../lib/logger.js';
import { emitOrderEvent } from '../lib/events.js';

const logger = createLogger('order-service');

// ===================
// TYPES
// ===================

export interface OrderItemInput {
    productId: string;
    productName: string;
    unitPriceKobo: number;
    quantity: number;
}

export interface CreateOrderInput {
    vendorId: string;
    buyerPhone: string;
    buyerEmail?: string;
    items: OrderItemInput[];
}

export interface OrderWithItems {
    id: string;
    vendorId: string;
    status: OrderStatus;
    buyerPhone: string;
    buyerEmail: string | null;
    totalAmountKobo: number;
    createdAt: Date;
    confirmedAt: Date | null;
    fulfilledAt: Date | null;
    items: {
        id: string;
        productName: string;
        unitPriceKobo: number;
        quantity: number;
        originalProductId: string | null;
    }[];
    payment: {
        id: string;
        status: PaymentStatus;
        internalRef: string;
        paystackRef: string | null;
    } | null;
}

// ===================
// ORDER STATE MACHINE
// ===================

/**
 * Valid order status transitions
 * 
 * AWAITING_PAYMENT -> CONFIRMED  ✓ (webhook success)
 * AWAITING_PAYMENT -> CANCELLED  ✓ (payment failed)
 * CONFIRMED -> FULFILLED         ✓ (vendor action)
 * CONFIRMED -> REFUNDED          ✓ (refund processed)
 * Others                         ✗
 */
const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    CREATED: [OrderStatus.AWAITING_PAYMENT],
    AWAITING_PAYMENT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    CONFIRMED: [OrderStatus.FULFILLED, OrderStatus.REFUNDED],
    FULFILLED: [],    // Terminal state
    CANCELLED: [],    // Terminal state
    REFUNDED: [],     // Terminal state
};

export function canTransitionOrderStatus(
    currentStatus: OrderStatus,
    newStatus: OrderStatus
): boolean {
    if (currentStatus === newStatus) {
        return true; // No-op is always valid
    }
    return VALID_ORDER_TRANSITIONS[currentStatus].includes(newStatus);
}

// ===================
// ORDER CREATION
// ===================

/**
 * Create an order at checkout initiation
 * 
 * This creates the order BEFORE payment is initiated.
 * The order starts in AWAITING_PAYMENT status.
 * 
 * @returns The created order with items
 */
export async function createOrderAtCheckout(
    prisma: PrismaClient,
    input: CreateOrderInput
): Promise<OrderWithItems> {
    // Calculate total
    const totalAmountKobo = input.items.reduce(
        (sum, item) => sum + (item.unitPriceKobo * item.quantity),
        0
    );

    if (totalAmountKobo <= 0) {
        throw new Error('Order total must be greater than zero');
    }

    if (input.items.length === 0) {
        throw new Error('Order must have at least one item');
    }

    // Create order with items in a transaction
    const order = await prisma.order.create({
        data: {
            vendorId: input.vendorId,
            buyerPhone: input.buyerPhone,
            buyerEmail: input.buyerEmail,
            totalAmountKobo,
            status: OrderStatus.AWAITING_PAYMENT,
            items: {
                create: input.items.map(item => ({
                    productName: item.productName,
                    unitPriceKobo: item.unitPriceKobo,
                    quantity: item.quantity,
                    originalProductId: item.productId,
                })),
            },
        },
        include: {
            items: true,
            payment: true,
        },
    });

    logger.info({
        orderId: order.id,
        vendorId: order.vendorId,
        totalAmountKobo: order.totalAmountKobo,
        itemCount: order.items.length,
    }, 'Order created at checkout');

    return order;
}

/**
 * Link a payment to an order
 */
export async function linkPaymentToOrder(
    prisma: PrismaClient,
    orderId: string,
    paymentId: string
): Promise<void> {
    await prisma.order.update({
        where: { id: orderId },
        data: { paymentId },
    });

    logger.info({ orderId, paymentId }, 'Payment linked to order');
}

// ===================
// ORDER STATUS TRANSITIONS
// ===================

/**
 * Confirm an order after payment verification
 * Only allowed from AWAITING_PAYMENT status
 * 
 * EPIC 6: Emits ORDER_CONFIRMED event for WhatsApp notifications
 */
export async function confirmOrder(
    prisma: PrismaClient,
    orderId: string
): Promise<void> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
    });

    if (!order) {
        throw new Error(`Order ${orderId} not found`);
    }

    // Already confirmed = idempotent success
    if (order.status === OrderStatus.CONFIRMED) {
        logger.info({ orderId }, 'Order already confirmed (idempotent)');
        return;
    }

    if (!canTransitionOrderStatus(order.status, OrderStatus.CONFIRMED)) {
        throw new Error(
            `Invalid order status transition: ${order.status} -> CONFIRMED`
        );
    }

    await prisma.order.update({
        where: { id: orderId },
        data: {
            status: OrderStatus.CONFIRMED,
            confirmedAt: new Date(),
        },
    });

    logger.info({ orderId }, 'Order confirmed');

    // EPIC 6: Emit event for WhatsApp notifications (non-blocking side effect)
    await emitOrderConfirmedEvent(prisma, orderId);
}

/**
 * Cancel an order after payment failure
 * Only allowed from AWAITING_PAYMENT status
 */
export async function cancelOrder(
    prisma: PrismaClient,
    orderId: string
): Promise<void> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
    });

    if (!order) {
        throw new Error(`Order ${orderId} not found`);
    }

    if (!canTransitionOrderStatus(order.status, OrderStatus.CANCELLED)) {
        throw new Error(
            `Invalid order status transition: ${order.status} -> CANCELLED`
        );
    }

    await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
    });

    logger.info({ orderId }, 'Order cancelled');
}

/**
 * Mark an order as fulfilled
 * Only allowed from CONFIRMED status
 * 
 * EPIC 6: Emits ORDER_FULFILLED event for WhatsApp notifications
 */
export async function fulfillOrder(
    prisma: PrismaClient,
    orderId: string,
    vendorId: string
): Promise<void> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, vendorId: true },
    });

    if (!order) {
        throw new Error(`Order ${orderId} not found`);
    }

    // Security: Verify vendor owns this order
    if (order.vendorId !== vendorId) {
        throw new Error('Unauthorized: Order does not belong to this vendor');
    }

    if (!canTransitionOrderStatus(order.status, OrderStatus.FULFILLED)) {
        throw new Error(
            `Invalid order status transition: ${order.status} -> FULFILLED`
        );
    }

    await prisma.order.update({
        where: { id: orderId },
        data: {
            status: OrderStatus.FULFILLED,
            fulfilledAt: new Date(),
        },
    });

    logger.info({ orderId, vendorId }, 'Order fulfilled');

    // EPIC 6: Emit event for WhatsApp notifications (non-blocking side effect)
    await emitOrderFulfilledEvent(prisma, orderId);
}

// ===================
// EVENT EMISSION HELPERS (Epic 6)
// ===================

/**
 * Emit ORDER_CONFIRMED event with full order context
 * 
 * This fetches the order details needed for WhatsApp notifications.
 * Note: Vendor phone is looked up from vendor/store if available.
 */
async function emitOrderConfirmedEvent(
    prisma: PrismaClient,
    orderId: string
): Promise<void> {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
            },
        });

        if (!order) {
            logger.warn({ orderId }, 'Order not found for event emission');
            return;
        }

        // Try to get store name from vendor's first store
        // In future, this should come from the order itself
        let storeName = 'Store';
        let vendorPhone: string | null = null;

        try {
            const vendor = await prisma.vendor.findUnique({
                where: { id: order.vendorId },
                include: {
                    store: true,
                },
            });

            if (vendor?.store?.name) {
                storeName = vendor.store.name;
            }
            if (vendor?.phone) {
                vendorPhone = vendor.phone;
            }
        } catch (e) {
            // Non-critical - use defaults
        }

        await emitOrderEvent({
            type: 'ORDER_CONFIRMED',
            orderId: order.id,
            vendorId: order.vendorId,
            buyerPhone: order.buyerPhone,
            buyerEmail: order.buyerEmail,
            storeName,
            vendorPhone,
            totalAmountKobo: order.totalAmountKobo,
            items: order.items.map(item => ({
                productName: item.productName,
                quantity: item.quantity,
                unitPriceKobo: item.unitPriceKobo,
            })),
            timestamp: new Date(),
        });
    } catch (error) {
        // Event emission must never block order flow
        logger.error({
            orderId,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to emit ORDER_CONFIRMED event');
    }
}

/**
 * Emit ORDER_FULFILLED event with full order context
 */
async function emitOrderFulfilledEvent(
    prisma: PrismaClient,
    orderId: string
): Promise<void> {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
            },
        });

        if (!order) {
            logger.warn({ orderId }, 'Order not found for event emission');
            return;
        }

        // Try to get store name
        let storeName = 'Store';

        try {
            const vendor = await prisma.vendor.findUnique({
                where: { id: order.vendorId },
                include: {
                    store: true,
                },
            });

            if (vendor?.store?.name) {
                storeName = vendor.store.name;
            }
        } catch (e) {
            // Non-critical - use defaults
        }

        await emitOrderEvent({
            type: 'ORDER_FULFILLED',
            orderId: order.id,
            vendorId: order.vendorId,
            buyerPhone: order.buyerPhone,
            buyerEmail: order.buyerEmail,
            storeName,
            vendorPhone: null,
            totalAmountKobo: order.totalAmountKobo,
            items: order.items.map(item => ({
                productName: item.productName,
                quantity: item.quantity,
                unitPriceKobo: item.unitPriceKobo,
            })),
            timestamp: new Date(),
        });
    } catch (error) {
        // Event emission must never block order flow
        logger.error({
            orderId,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to emit ORDER_FULFILLED event');
    }
}

// ===================
// ORDER QUERIES
// ===================

/**
 * Get an order by ID with all details
 */
export async function getOrderById(
    prisma: PrismaClient,
    orderId: string
): Promise<OrderWithItems | null> {
    return prisma.order.findUnique({
        where: { id: orderId },
        include: {
            items: true,
            payment: {
                select: {
                    id: true,
                    status: true,
                    internalRef: true,
                    paystackRef: true,
                },
            },
        },
    });
}

/**
 * Get an order by payment ID
 */
export async function getOrderByPaymentId(
    prisma: PrismaClient,
    paymentId: string
): Promise<OrderWithItems | null> {
    return prisma.order.findUnique({
        where: { paymentId },
        include: {
            items: true,
            payment: {
                select: {
                    id: true,
                    status: true,
                    internalRef: true,
                    paystackRef: true,
                },
            },
        },
    });
}

export interface GetVendorOrdersOptions {
    status?: OrderStatus;
    limit?: number;
    offset?: number;
}

/**
 * Get orders for a vendor with optional filters
 */
export async function getVendorOrders(
    prisma: PrismaClient,
    vendorId: string,
    options: GetVendorOrdersOptions = {}
): Promise<{ orders: OrderWithItems[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    const where = {
        vendorId,
        ...(status && { status }),
    };

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where,
            include: {
                items: true,
                payment: {
                    select: {
                        id: true,
                        status: true,
                        internalRef: true,
                        paystackRef: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        prisma.order.count({ where }),
    ]);

    return { orders, total };
}
