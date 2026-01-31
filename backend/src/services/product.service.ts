import { PrismaClient, Product, ProductStatus } from '@prisma/client';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('product-service');

// ===================
// TYPES
// ===================

export interface CreateProductInput {
    storeId: string;
    name: string;
    slug?: string;  // Auto-generated if not provided
    price: number;  // In smallest unit (kobo)
    currency?: string;
    description?: string;
}

export interface UpdateProductInput {
    name?: string;
    slug?: string;
    price?: number;
    currency?: string;
    description?: string;
}

// ===================
// HELPERS
// ===================

/**
 * Generate a URL-safe slug from a product name
 * 
 * Rules:
 * - Lowercase
 * - Replace spaces with hyphens
 * - Remove special characters
 * - Max 50 characters
 */
export function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
        .replace(/\s+/g, '-')           // Replace spaces with hyphens
        .replace(/-+/g, '-')            // Replace multiple hyphens with single
        .substring(0, 50);              // Max 50 chars
}

/**
 * Generate a unique slug for a product within a store
 * Appends a random suffix if the base slug already exists
 */
async function generateUniqueSlug(
    prisma: PrismaClient,
    storeId: string,
    baseName: string
): Promise<string> {
    let slug = generateSlug(baseName);
    let suffix = 0;

    while (true) {
        const candidateSlug = suffix === 0 ? slug : `${slug}-${suffix}`;

        const existing = await prisma.product.findUnique({
            where: {
                storeId_slug: { storeId, slug: candidateSlug }
            }
        });

        if (!existing) {
            return candidateSlug;
        }

        suffix++;

        // Safety limit
        if (suffix > 100) {
            throw new Error('SLUG_GENERATION_FAILED');
        }
    }
}

// ===================
// CRUD OPERATIONS
// ===================

/**
 * Create a new product
 * 
 * Auto-generates slug from name if not provided.
 * Enforces unique (storeId, slug) constraint.
 */
export async function createProduct(
    prisma: PrismaClient,
    input: CreateProductInput
): Promise<Product> {
    const { storeId, name, price, currency = 'NGN', description } = input;

    // Generate slug if not provided
    const slug = input.slug
        ? generateSlug(input.slug)
        : await generateUniqueSlug(prisma, storeId, name);

    // If slug was provided, verify it's unique
    if (input.slug) {
        const existing = await prisma.product.findUnique({
            where: {
                storeId_slug: { storeId, slug }
            }
        });

        if (existing) {
            throw new Error('SLUG_EXISTS');
        }
    }

    const product = await prisma.product.create({
        data: {
            storeId,
            name,
            slug,
            price,
            currency,
            description,
            status: ProductStatus.ACTIVE,
        },
    });

    logger.info({
        productId: product.id,
        storeId,
        name,
        slug,
        price,
    }, 'Product created');

    return product;
}

/**
 * Get all products for a store
 * 
 * Returns all products (both ACTIVE and PAUSED) for the vendor's own view.
 */
export async function getProductsByStoreId(
    prisma: PrismaClient,
    storeId: string
): Promise<Product[]> {
    return prisma.product.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Get a single product by ID with ownership verification
 * 
 * Returns null if product doesn't exist or doesn't belong to the store.
 */
export async function getProductById(
    prisma: PrismaClient,
    productId: string,
    storeId: string
): Promise<Product | null> {
    return prisma.product.findFirst({
        where: {
            id: productId,
            storeId,  // Ownership check
        },
    });
}

/**
 * Update a product
 * 
 * Only updates provided fields. Verifies ownership via storeId.
 */
export async function updateProduct(
    prisma: PrismaClient,
    productId: string,
    storeId: string,
    input: UpdateProductInput
): Promise<Product | null> {
    // First verify ownership
    const existing = await prisma.product.findFirst({
        where: { id: productId, storeId },
    });

    if (!existing) {
        return null;
    }

    // If updating slug, check for uniqueness
    if (input.slug && input.slug !== existing.slug) {
        const slugExists = await prisma.product.findUnique({
            where: {
                storeId_slug: { storeId, slug: generateSlug(input.slug) }
            }
        });

        if (slugExists) {
            throw new Error('SLUG_EXISTS');
        }
    }

    const product = await prisma.product.update({
        where: { id: productId },
        data: {
            name: input.name,
            slug: input.slug ? generateSlug(input.slug) : undefined,
            price: input.price,
            currency: input.currency,
            description: input.description,
        },
    });

    logger.info({
        productId,
        storeId,
        updates: Object.keys(input).filter(k => input[k as keyof UpdateProductInput] !== undefined),
    }, 'Product updated');

    return product;
}

/**
 * Update product status (ACTIVE/PAUSED)
 * 
 * PAUSED products:
 * - Hidden from public
 * - Cannot be purchased
 */
export async function updateProductStatus(
    prisma: PrismaClient,
    productId: string,
    storeId: string,
    status: ProductStatus
): Promise<Product | null> {
    // Verify ownership
    const existing = await prisma.product.findFirst({
        where: { id: productId, storeId },
    });

    if (!existing) {
        return null;
    }

    const product = await prisma.product.update({
        where: { id: productId },
        data: { status },
    });

    logger.info({
        productId,
        storeId,
        previousStatus: existing.status,
        newStatus: status,
    }, 'Product status updated');

    return product;
}

/**
 * Delete a product
 * 
 * Verifies ownership before deletion.
 */
export async function deleteProduct(
    prisma: PrismaClient,
    productId: string,
    storeId: string
): Promise<boolean> {
    // Verify ownership
    const existing = await prisma.product.findFirst({
        where: { id: productId, storeId },
    });

    if (!existing) {
        return false;
    }

    await prisma.product.delete({
        where: { id: productId },
    });

    logger.info({
        productId,
        storeId,
        name: existing.name,
    }, 'Product deleted');

    return true;
}
