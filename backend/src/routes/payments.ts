import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { createPaymentIntent } from '../services/payment.service.js';
import { createOrderAtCheckout, linkPaymentToOrder } from '../services/order.service.js';

const logger = createLogger('payments-route');

// ===================
// REQUEST SCHEMAS
// ===================

const initializePaymentSchema = z.object({
    amount: z.number().int().positive('Amount must be a positive integer in kobo'),
    currency: z.literal('NGN', {
        errorMap: () => ({ message: 'Only NGN currency is supported' }),
    }),
    email: z.string().email('Valid email is required'),
    vendorRef: z.string().optional(),
    productRef: z.string().optional(),
    callbackUrl: z.string().url().optional(),
});

type InitializePaymentBody = z.infer<typeof initializePaymentSchema>;

// Checkout schema - the new order-first flow
const checkoutItemSchema = z.object({
    productId: z.string().uuid('Valid product ID required'),
    productName: z.string().min(1, 'Product name required'),
    unitPriceKobo: z.number().int().positive('Price must be positive'),
    quantity: z.number().int().positive('Quantity must be at least 1'),
});

const checkoutSchema = z.object({
    vendorId: z.string().uuid('Valid vendor ID required'),
    buyerPhone: z.string().min(10, 'Valid phone number required'),
    buyerEmail: z.string().email().optional(),
    items: z.array(checkoutItemSchema).min(1, 'At least one item required'),
    callbackUrl: z.string().url().optional(),
});

type CheckoutBody = z.infer<typeof checkoutSchema>;

// ===================
// ROUTE HANDLERS
// ===================

/**
 * POST /api/checkout
 * 
 * Epic 5 Checkout Flow (Order-First):
 * 1. Validate vendor + product payload
 * 2. Create Order with status AWAITING_PAYMENT
 * 3. Create OrderItems as frozen snapshots
 * 4. Create linked Payment record
 * 5. Generate Paystack reference tied to Order ID
 * 
 * RULE: Order exists even if payment fails.
 */
async function checkoutHandler(
    request: FastifyRequest<{ Body: CheckoutBody }>,
    reply: FastifyReply
) {
    try {
        // Validate request body
        const validationResult = checkoutSchema.safeParse(request.body);

        if (!validationResult.success) {
            logger.warn({
                errors: validationResult.error.errors,
            }, 'Checkout validation failed');

            return reply.status(400).send({
                success: false,
                error: 'Validation failed',
                details: validationResult.error.errors,
            });
        }

        const body = validationResult.data;
        const prisma = getPrismaClient();

        // Calculate total
        const totalAmountKobo = body.items.reduce(
            (sum, item) => sum + (item.unitPriceKobo * item.quantity),
            0
        );

        // STEP 1: Create Order with AWAITING_PAYMENT status
        const order = await createOrderAtCheckout(prisma, {
            vendorId: body.vendorId,
            buyerPhone: body.buyerPhone,
            buyerEmail: body.buyerEmail,
            items: body.items,
        });

        logger.info({
            orderId: order.id,
            vendorId: order.vendorId,
            totalAmountKobo,
            itemCount: order.items.length,
        }, 'Order created at checkout');

        // STEP 2: Create Payment linked to Order
        const paymentResult = await createPaymentIntent(prisma, {
            amount: totalAmountKobo,
            currency: 'NGN',
            email: body.buyerEmail || `${body.buyerPhone}@tanna.local`, // Paystack requires email
            vendorRef: body.vendorId,
            productRef: order.id, // Store order ID for reconciliation
            callbackUrl: body.callbackUrl,
        });

        // STEP 3: Link payment to order
        await linkPaymentToOrder(prisma, order.id, paymentResult.paymentId);

        logger.info({
            orderId: order.id,
            paymentId: paymentResult.paymentId,
            internalRef: paymentResult.internalRef,
        }, 'Payment linked to order');

        return reply.status(201).send({
            success: true,
            order: {
                id: order.id,
                status: order.status,
                totalAmountKobo: order.totalAmountKobo,
                itemCount: order.items.length,
            },
            payment: {
                internalRef: paymentResult.internalRef,
                paystackRef: paymentResult.paystackRef,
                authorizationUrl: paymentResult.authorizationUrl,
            },
        });
    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        }, 'Checkout failed');

        return reply.status(500).send({
            success: false,
            error: 'Checkout failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * POST /api/payments/initialize
 * 
 * Initialize a payment intent (legacy endpoint).
 * Creates a PENDING payment and returns Paystack authorization URL.
 * 
 * NOTE: For new integrations, use POST /api/checkout instead.
 */
async function initializePaymentHandler(
    request: FastifyRequest<{ Body: InitializePaymentBody }>,
    reply: FastifyReply
) {
    try {
        // Validate request body
        const validationResult = initializePaymentSchema.safeParse(request.body);

        if (!validationResult.success) {
            logger.warn({
                errors: validationResult.error.errors,
            }, 'Payment initialization validation failed');

            return reply.status(400).send({
                success: false,
                error: 'Validation failed',
                details: validationResult.error.errors,
            });
        }

        const body = validationResult.data;
        const prisma = getPrismaClient();

        // Create payment intent
        const result = await createPaymentIntent(prisma, {
            amount: body.amount,
            currency: body.currency,
            email: body.email,
            vendorRef: body.vendorRef,
            productRef: body.productRef,
            callbackUrl: body.callbackUrl,
        });

        logger.info({
            internalRef: result.internalRef,
            email: body.email,
            amount: body.amount,
        }, 'Payment intent created successfully');

        return reply.status(201).send({
            success: true,
            payment: {
                internalRef: result.internalRef,
                paystackRef: result.paystackRef,
                authorizationUrl: result.authorizationUrl,
            },
        });
    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        }, 'Payment initialization failed');

        return reply.status(500).send({
            success: false,
            error: 'Payment initialization failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}



/**
 * GET /api/payments/:reference
 * 
 * Get payment status by reference (internal or Paystack).
 * Returns full order context for confirmation page:
 * - Payment status and amount
 * - Order details with items
 * - Store info for trust signals
 */
async function getPaymentStatusHandler(
    request: FastifyRequest<{ Params: { reference: string } }>,
    reply: FastifyReply
) {
    const { reference } = request.params;
    const prisma = getPrismaClient();

    try {
        // Use service to lookup payment with full order context
        const { getPaymentByReference } = await import('../services/payment.service.js');
        const payment = await getPaymentByReference(prisma, reference);

        if (!payment) {
            return reply.status(404).send({
                success: false,
                error: 'Payment not found',
            });
        }

        // Fetch store details if order exists
        let store: { name: string; slug: string } | null = null;
        if (payment?.order?.vendorId) {
            const storeRecord = await prisma.store.findUnique({
                where: { vendorId: payment.order.vendorId },
                select: { name: true, slug: true },
            });
            if (storeRecord) {
                store = { name: storeRecord.name, slug: storeRecord.slug };
            }
        }

        // Fetch order items with product details
        let items: Array<{
            productName: string;
            productImage: string | null;
            quantity: number;
            unitPriceKobo: number;
        }> = [];

        if (payment.order) {
            const orderItems = await prisma.orderItem.findMany({
                where: { orderId: payment.order.id },
                select: {
                    productName: true,
                    unitPriceKobo: true,
                    quantity: true,
                },
            });

            // Map items to response format
            items = orderItems.map((item) => ({
                productName: item.productName,
                productImage: null, // Product images not yet implemented
                quantity: item.quantity,
                unitPriceKobo: item.unitPriceKobo,
            }));
        }

        // Mask buyer phone for privacy (show last 4 digits)
        // Using type assertion since TypeScript can't infer dynamic import return types
        const orderData = payment.order as {
            id: string;
            vendorId: string;
            status: string;
            totalAmountKobo: number;
            buyerPhone: string;
            createdAt: Date;
            confirmedAt: Date | null;
        } | null;

        const maskedPhone = orderData?.buyerPhone
            ? `****${orderData.buyerPhone.slice(-4)}`
            : null;

        return reply.status(200).send({
            success: true,
            payment: {
                id: payment.id,
                status: payment.status,
                amount: payment.amountKobo,
                currency: payment.currency,
                createdAt: payment.createdAt,
                verifiedAt: payment.verifiedAt,
            },
            order: orderData ? {
                id: orderData.id,
                shortRef: orderData.id.slice(0, 8).toUpperCase(),
                status: orderData.status,
                totalAmountKobo: orderData.totalAmountKobo,
                buyerPhone: maskedPhone,
                createdAt: orderData.createdAt,
                confirmedAt: orderData.confirmedAt,
                items,
            } : null,
            store,
        });

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            reference,
        }, 'Payment status check failed');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function paymentsRoutes(fastify: FastifyInstance) {
    // NEW: Order-first checkout flow
    fastify.post('/api/checkout', checkoutHandler);

    // Legacy: Initialize payment intent
    fastify.post('/api/payments/initialize', initializePaymentHandler);

    // Get payment status
    fastify.get('/api/payments/:reference', getPaymentStatusHandler);

    logger.debug('Payments routes registered');
}

