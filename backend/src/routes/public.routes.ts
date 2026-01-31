import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { getPublicProduct, getProductById, getProductBySlugAndStore } from '../services/public.service.js';
import { createOrderAtCheckout, linkPaymentToOrder } from '../services/order.service.js';
import { createPaymentIntent } from '../services/payment.service.js';

const logger = createLogger('public-routes');

// ===================
// REQUEST SCHEMAS
// ===================

// Public checkout - exactly one product per order
const publicCheckoutSchema = z.object({
    // Either productId OR (productSlug + storeSlug) required
    productId: z.string().uuid().optional(),
    productSlug: z.string().optional(),
    storeSlug: z.string().optional(),

    // Buyer information
    buyerPhone: z.string().min(10, 'Valid phone number required'),
    buyerEmail: z.string().email().optional(),

    // Optional callback URL
    callbackUrl: z.string().url().optional(),
}).refine(
    (data) => data.productId || (data.productSlug && data.storeSlug),
    {
        message: 'Either productId OR both productSlug and storeSlug are required',
    }
);

type PublicCheckoutBody = z.infer<typeof publicCheckoutSchema>;

// ===================
// ROUTE HANDLERS
// ===================

/**
 * GET /api/public/store/:storeSlug/product/:productSlug
 * 
 * EPIC3-BACKEND-01: Public Product Fetch API
 * 
 * Returns public product data without authentication:
 * - Product name, price, currency, description
 * - Store name
 * 
 * No vendor-only fields exposed.
 */
async function getPublicProductHandler(
    request: FastifyRequest<{
        Params: {
            storeSlug: string;
            productSlug: string;
        };
    }>,
    reply: FastifyReply
) {
    const { storeSlug, productSlug } = request.params;
    const prisma = getPrismaClient();

    try {
        const result = await getPublicProduct(prisma, storeSlug, productSlug);

        if (!result) {
            return reply.status(404).send({
                success: false,
                error: 'Not found',
                message: 'Store or product not found',
            });
        }

        return reply.status(200).send({
            success: true,
            product: {
                name: result.product.name,
                price: result.product.price,
                currency: result.product.currency,
                description: result.product.description,
            },
            store: {
                name: result.store.name,
            },
        });
    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            storeSlug,
            productSlug,
        }, 'Failed to fetch public product');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * POST /api/public/checkout
 * 
 * EPIC3-BACKEND-02: Order-First Checkout Entry (Public)
 * 
 * Creates an order for a SINGLE product and returns Paystack payment URL.
 * 
 * Flow:
 * 1. Validate product exists (by ID or by slug)
 * 2. Create Order with status AWAITING_PAYMENT
 * 3. Create Payment linked to order
 * 4. Return Paystack authorization URL
 * 
 * Rules:
 * - No authentication required
 * - No carts - exactly one product per order
 * - Buyer does not get an account
 */
async function publicCheckoutHandler(
    request: FastifyRequest<{ Body: PublicCheckoutBody }>,
    reply: FastifyReply
) {
    try {
        // Validate request body
        const validationResult = publicCheckoutSchema.safeParse(request.body);

        if (!validationResult.success) {
            logger.warn({
                errors: validationResult.error.errors,
            }, 'Public checkout validation failed');

            return reply.status(400).send({
                success: false,
                error: 'Validation failed',
                details: validationResult.error.errors,
            });
        }

        const body = validationResult.data;
        const prisma = getPrismaClient();

        // STEP 1: Resolve product
        // Note: getProductById and getProductBySlugAndStore only return ACTIVE products.
        // We do an additional check here for PAUSED products to return a clearer error.
        let product: {
            id: string;
            name: string;
            price: number;
            storeId: string;
            vendorId: string;
            currency: string;
        } | null = null;

        if (body.productId) {
            // Lookup by product ID
            product = await getProductById(prisma, body.productId);

            // Check if product exists but is PAUSED
            if (!product) {
                const pausedProduct = await prisma.product.findUnique({
                    where: { id: body.productId },
                    select: { status: true }
                });

                if (pausedProduct && pausedProduct.status === 'PAUSED') {
                    return reply.status(400).send({
                        success: false,
                        error: 'Product unavailable',
                        message: 'This product is currently paused and cannot be purchased. Please contact the seller.',
                    });
                }
            }
        } else if (body.productSlug && body.storeSlug) {
            // Lookup by product slug + store slug
            product = await getProductBySlugAndStore(prisma, body.productSlug, body.storeSlug);

            // Check if product exists but is PAUSED
            if (!product) {
                const store = await prisma.store.findUnique({
                    where: { slug: body.storeSlug },
                    select: { id: true }
                });

                if (store) {
                    const pausedProduct = await prisma.product.findFirst({
                        where: { slug: body.productSlug, storeId: store.id },
                        select: { status: true }
                    });

                    if (pausedProduct && pausedProduct.status === 'PAUSED') {
                        return reply.status(400).send({
                            success: false,
                            error: 'Product unavailable',
                            message: 'This product is currently paused and cannot be purchased. Please contact the seller.',
                        });
                    }
                }
            }
        }

        if (!product) {
            return reply.status(404).send({
                success: false,
                error: 'Product not found',
                message: 'The specified product does not exist or is not available',
            });
        }

        logger.info({
            productId: product.id,
            productName: product.name,
            price: product.price,
            vendorId: product.vendorId,
        }, 'Product resolved for public checkout');;

        // STEP 2: Create Order with AWAITING_PAYMENT status
        // Exactly one item per order (no carts)
        const order = await createOrderAtCheckout(prisma, {
            vendorId: product.vendorId,
            buyerPhone: body.buyerPhone,
            buyerEmail: body.buyerEmail,
            items: [{
                productId: product.id,
                productName: product.name,
                unitPriceKobo: product.price,
                quantity: 1,  // Epic 3: exactly one product per order
            }],
        });

        logger.info({
            orderId: order.id,
            vendorId: order.vendorId,
            totalAmountKobo: order.totalAmountKobo,
        }, 'Order created at public checkout');

        // STEP 3: Create Payment linked to Order
        const paymentResult = await createPaymentIntent(prisma, {
            amount: order.totalAmountKobo,
            currency: product.currency,
            email: body.buyerEmail || `${body.buyerPhone.replace(/\D/g, '')}@tanna.local`,  // Paystack requires email
            vendorRef: product.vendorId,
            productRef: order.id,  // Store order ID for reconciliation
            callbackUrl: body.callbackUrl,
        });

        // STEP 4: Link payment to order
        await linkPaymentToOrder(prisma, order.id, paymentResult.paymentId);

        logger.info({
            orderId: order.id,
            paymentId: paymentResult.paymentId,
            internalRef: paymentResult.internalRef,
        }, 'Payment linked to order at public checkout');

        return reply.status(201).send({
            success: true,
            order: {
                id: order.id,
                status: order.status,
                totalAmountKobo: order.totalAmountKobo,
            },
            authorizationUrl: paymentResult.authorizationUrl,
        });

    } catch (error) {
        logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        }, 'Public checkout failed');

        return reply.status(500).send({
            success: false,
            error: 'Checkout failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function publicRoutes(fastify: FastifyInstance) {
    // EPIC3-BACKEND-01: Public Product Fetch API
    fastify.get('/api/public/store/:storeSlug/product/:productSlug', getPublicProductHandler);

    // EPIC3-BACKEND-02: Order-First Checkout Entry (Public)
    fastify.post('/api/public/checkout', publicCheckoutHandler);

    logger.debug('Public routes registered (no auth required)');
}
