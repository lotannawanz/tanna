import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { StoreStatus } from '@prisma/client';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createStore, getStoreByVendorId } from '../services/store.service.js';

const logger = createLogger('store-route');

// ===================
// REQUEST SCHEMAS
// ===================

const createStoreSchema = z.object({
    name: z.string().min(1, 'Store name is required').max(100, 'Store name too long'),
    slug: z.string()
        .min(3, 'Slug must be at least 3 characters')
        .max(50, 'Slug too long')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens only'),
    currency: z.string().length(3, 'Currency must be 3 characters').default('NGN'),
    deliveryEstimateText: z.string().max(200).optional(),
});

const updateStoreSchema = z.object({
    name: z.string().min(1, 'Store name is required').max(100, 'Store name too long').optional(),
    status: z.nativeEnum(StoreStatus).optional(),
    deliveryEstimateText: z.string().max(200).optional(),
});

// ===================
// ROUTE HANDLERS
// ===================

/**
 * POST /api/store
 * 
 * Create a store for the authenticated vendor
 */
async function createStoreHandler(
    request: FastifyRequest<{
        Body: z.infer<typeof createStoreSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate input
        const parseResult = createStoreSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: parseResult.error.errors,
            });
        }

        const { name, slug, currency, deliveryEstimateText } = parseResult.data;
        const vendorId = request.vendorId!;
        const prisma = getPrismaClient();

        const store = await createStore(prisma, {
            vendorId,
            name,
            slug,
            currency,
            deliveryEstimateText,
        });

        logger.info({ storeId: store.id, vendorId, slug }, 'Store created via API');

        return reply.status(201).send({
            success: true,
            store: {
                id: store.id,
                name: store.name,
                slug: store.slug,
                currency: store.currency,
                deliveryEstimateText: store.deliveryEstimateText,
                createdAt: store.createdAt,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message === 'VENDOR_HAS_STORE') {
            return reply.status(409).send({
                success: false,
                error: 'Vendor already has a store',
                message: 'Each vendor can only have one store',
            });
        }

        if (message === 'SLUG_EXISTS') {
            return reply.status(409).send({
                success: false,
                error: 'Slug already taken',
                message: 'Please choose a different store URL',
            });
        }

        if (message === 'INVALID_SLUG') {
            return reply.status(400).send({
                success: false,
                error: 'Invalid slug format',
                message: 'Slug must be lowercase alphanumeric with hyphens only',
            });
        }

        logger.error({ error: message }, 'Store creation failed');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * GET /api/store
 * 
 * Get the authenticated vendor's store
 */
async function getMyStoreHandler(
    request: FastifyRequest,
    reply: FastifyReply
) {
    try {
        const vendorId = request.vendorId!;
        const prisma = getPrismaClient();

        const store = await getStoreByVendorId(prisma, vendorId);

        if (!store) {
            return reply.status(404).send({
                success: false,
                error: 'Store not found',
                message: 'You have not created a store yet',
            });
        }

        return reply.status(200).send({
            success: true,
            store: {
                id: store.id,
                name: store.name,
                slug: store.slug,
                status: store.status,
                currency: store.currency,
                deliveryEstimateText: store.deliveryEstimateText,
                createdAt: store.createdAt,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'Failed to get store');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * PATCH /api/store
 * 
 * Update the authenticated vendor's store settings
 */
async function updateStoreHandler(
    request: FastifyRequest<{
        Body: z.infer<typeof updateStoreSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate input
        const parseResult = updateStoreSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: parseResult.error.errors,
            });
        }

        const vendorId = request.vendorId!;
        const prisma = getPrismaClient();

        // Check store exists
        const existingStore = await prisma.store.findUnique({
            where: { vendorId },
        });

        if (!existingStore) {
            return reply.status(404).send({
                success: false,
                error: 'Store not found',
                message: 'You have not created a store yet',
            });
        }

        // Build update data
        const updateData: { name?: string; status?: StoreStatus; deliveryEstimateText?: string } = {};

        if (parseResult.data.name !== undefined) {
            updateData.name = parseResult.data.name;
        }
        if (parseResult.data.status !== undefined) {
            updateData.status = parseResult.data.status;
        }
        if (parseResult.data.deliveryEstimateText !== undefined) {
            updateData.deliveryEstimateText = parseResult.data.deliveryEstimateText;
        }

        // Update store
        const store = await prisma.store.update({
            where: { vendorId },
            data: updateData,
        });

        logger.info({
            storeId: store.id,
            vendorId,
            updatedFields: Object.keys(updateData),
        }, 'Store updated via API');

        return reply.status(200).send({
            success: true,
            store: {
                id: store.id,
                name: store.name,
                slug: store.slug,
                status: store.status,
                currency: store.currency,
                deliveryEstimateText: store.deliveryEstimateText,
                createdAt: store.createdAt,
                updatedAt: store.updatedAt,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'Failed to update store');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function storeRoutes(fastify: FastifyInstance) {
    // Apply auth middleware to all store routes
    fastify.addHook('onRequest', authMiddleware);

    // Create store
    fastify.post('/api/store', createStoreHandler);

    // Get my store
    fastify.get('/api/store', getMyStoreHandler);

    // Update my store
    fastify.patch('/api/store', updateStoreHandler);

    logger.debug('Store routes registered');
}
