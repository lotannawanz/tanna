import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ProductStatus } from '@prisma/client';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
    createProduct,
    getProductsByStoreId,
    getProductById,
    updateProduct,
    updateProductStatus,
} from '../services/product.service.js';

const logger = createLogger('products-route');

// ===================
// REQUEST SCHEMAS
// ===================

const createProductSchema = z.object({
    name: z.string().min(1, 'Product name is required').max(200, 'Name too long'),
    slug: z.string()
        .min(3, 'Slug must be at least 3 characters')
        .max(50, 'Slug too long')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens only')
        .optional(),
    price: z.number().int().positive('Price must be a positive integer (in kobo)'),
    currency: z.string().length(3, 'Currency must be 3 characters').default('NGN'),
    description: z.string().max(2000, 'Description too long').optional(),
});

const updateProductSchema = z.object({
    name: z.string().min(1, 'Product name is required').max(200, 'Name too long').optional(),
    slug: z.string()
        .min(3, 'Slug must be at least 3 characters')
        .max(50, 'Slug too long')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens only')
        .optional(),
    price: z.number().int().positive('Price must be a positive integer (in kobo)').optional(),
    currency: z.string().length(3, 'Currency must be 3 characters').optional(),
    description: z.string().max(2000, 'Description too long').optional(),
});

const updateStatusSchema = z.object({
    status: z.enum(['ACTIVE', 'PAUSED']),
});

// ===================
// ROUTE HANDLERS
// ===================

/**
 * POST /api/products
 * 
 * Create a new product for the authenticated vendor's store
 */
async function createProductHandler(
    request: FastifyRequest<{ Body: z.infer<typeof createProductSchema> }>,
    reply: FastifyReply
) {
    try {
        const storeId = request.storeId;

        if (!storeId) {
            return reply.status(400).send({
                success: false,
                error: 'Store required',
                message: 'You must create a store before adding products',
            });
        }

        const parseResult = createProductSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: parseResult.error.errors,
            });
        }

        const prisma = getPrismaClient();
        const product = await createProduct(prisma, {
            storeId,
            ...parseResult.data,
        });

        logger.info({
            productId: product.id,
            storeId,
            name: product.name,
        }, 'Product created via API');

        return reply.status(201).send({
            success: true,
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                currency: product.currency,
                description: product.description,
                status: product.status,
                createdAt: product.createdAt,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message === 'SLUG_EXISTS') {
            return reply.status(409).send({
                success: false,
                error: 'Slug already exists',
                message: 'A product with this slug already exists in your store',
            });
        }

        logger.error({ error: message }, 'Product creation failed');
        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * GET /api/products
 * 
 * List all products for the authenticated vendor's store
 */
async function listProductsHandler(
    request: FastifyRequest,
    reply: FastifyReply
) {
    try {
        const storeId = request.storeId;

        logger.info({ storeId, vendorId: request.vendorId }, 'listProductsHandler called');

        if (!storeId) {
            logger.warn({ vendorId: request.vendorId }, 'listProductsHandler: No store found for vendor');
            return reply.status(200).send({
                success: true,
                products: [],
                message: 'No store found. Create a store first.',
            });
        }

        const prisma = getPrismaClient();
        const products = await getProductsByStoreId(prisma, storeId);

        return reply.status(200).send({
            success: true,
            products: products.map(p => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                price: p.price,
                currency: p.currency,
                description: p.description,
                status: p.status,
                createdAt: p.createdAt,
            })),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'Failed to list products');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * GET /api/products/:productId
 * 
 * Get a single product by ID (must belong to vendor's store)
 */
async function getProductHandler(
    request: FastifyRequest<{ Params: { productId: string } }>,
    reply: FastifyReply
) {
    try {
        const { productId } = request.params;
        const storeId = request.storeId;

        if (!storeId) {
            return reply.status(404).send({
                success: false,
                error: 'Not found',
                message: 'Product not found',
            });
        }

        const prisma = getPrismaClient();
        const product = await getProductById(prisma, productId, storeId);

        if (!product) {
            return reply.status(404).send({
                success: false,
                error: 'Not found',
                message: 'Product not found',
            });
        }

        return reply.status(200).send({
            success: true,
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                currency: product.currency,
                description: product.description,
                status: product.status,
                createdAt: product.createdAt,
                updatedAt: product.updatedAt,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'Failed to get product');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * PUT /api/products/:productId
 * 
 * Update a product (must belong to vendor's store)
 */
async function updateProductHandler(
    request: FastifyRequest<{
        Params: { productId: string };
        Body: z.infer<typeof updateProductSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        const { productId } = request.params;
        const storeId = request.storeId;

        if (!storeId) {
            return reply.status(404).send({
                success: false,
                error: 'Not found',
                message: 'Product not found',
            });
        }

        const parseResult = updateProductSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: parseResult.error.errors,
            });
        }

        const prisma = getPrismaClient();
        const product = await updateProduct(prisma, productId, storeId, parseResult.data);

        if (!product) {
            return reply.status(404).send({
                success: false,
                error: 'Not found',
                message: 'Product not found',
            });
        }

        logger.info({ productId, storeId }, 'Product updated via API');

        return reply.status(200).send({
            success: true,
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                currency: product.currency,
                description: product.description,
                status: product.status,
                createdAt: product.createdAt,
                updatedAt: product.updatedAt,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message === 'SLUG_EXISTS') {
            return reply.status(409).send({
                success: false,
                error: 'Slug already exists',
                message: 'A product with this slug already exists in your store',
            });
        }

        logger.error({ error: message }, 'Failed to update product');
        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * PATCH /api/products/:productId/status
 * 
 * Update product status (ACTIVE/PAUSED)
 * 
 * PAUSED products are hidden from public and cannot be purchased.
 */
async function updateStatusHandler(
    request: FastifyRequest<{
        Params: { productId: string };
        Body: z.infer<typeof updateStatusSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        const { productId } = request.params;
        const storeId = request.storeId;

        if (!storeId) {
            return reply.status(404).send({
                success: false,
                error: 'Not found',
                message: 'Product not found',
            });
        }

        const parseResult = updateStatusSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: parseResult.error.errors,
            });
        }

        const prisma = getPrismaClient();
        const status = parseResult.data.status === 'ACTIVE'
            ? ProductStatus.ACTIVE
            : ProductStatus.PAUSED;

        const product = await updateProductStatus(prisma, productId, storeId, status);

        if (!product) {
            return reply.status(404).send({
                success: false,
                error: 'Not found',
                message: 'Product not found',
            });
        }

        logger.info({
            productId,
            storeId,
            status: product.status,
        }, 'Product status updated via API');

        return reply.status(200).send({
            success: true,
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                status: product.status,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'Failed to update product status');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function productsRoutes(fastify: FastifyInstance) {
    // Apply auth middleware to all product routes
    fastify.addHook('onRequest', authMiddleware);

    // CRUD endpoints
    fastify.post('/api/products', createProductHandler);
    fastify.get('/api/products', listProductsHandler);
    fastify.get('/api/products/:productId', getProductHandler);
    fastify.put('/api/products/:productId', updateProductHandler);
    fastify.patch('/api/products/:productId/status', updateStatusHandler);

    logger.debug('Products routes registered');
}
