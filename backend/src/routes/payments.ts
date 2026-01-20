import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { createPaymentIntent } from '../services/payment.service.js';

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

// ===================
// ROUTE HANDLERS
// ===================

/**
 * POST /api/payments/initialize
 * 
 * Initialize a payment intent.
 * Creates a PENDING payment and returns Paystack authorization URL.
 * 
 * NOTE: This does NOT create an order. Orders are created after payment confirmation.
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
 * This endpoint allows frontend to pool for status updates.
 */
async function getPaymentStatusHandler(
    request: FastifyRequest<{ Params: { reference: string } }>,
    reply: FastifyReply
) {
    const { reference } = request.params;
    const prisma = getPrismaClient();

    try {
        // Use service to lookup payment
        const { getPaymentByReference } = await import('../services/payment.service.js');
        const payment = await getPaymentByReference(prisma, reference);

        if (!payment) {
            return reply.status(404).send({
                success: false,
                error: 'Payment not found',
            });
        }

        return reply.status(200).send({
            success: true,
            payment: {
                id: payment.id,
                status: payment.status,
                amount: payment.amountKobo,
                currency: payment.currency,
                createdAt: payment.createdAt,
            },
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
    // Initialize payment intent
    fastify.post('/api/payments/initialize', initializePaymentHandler);

    // Get payment status
    fastify.get('/api/payments/:reference', getPaymentStatusHandler);

    logger.debug('Payments routes registered');
}
