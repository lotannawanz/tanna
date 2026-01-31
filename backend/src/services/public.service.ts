import { PrismaClient, ProductStatus, StoreStatus } from '@prisma/client';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('public-service');

// ===================
// TYPES
// ===================

export interface PublicProductData {
    name: string;
    slug: string | null;
    description: string | null;
    price: number;
    currency: string;
}

export interface PublicStoreData {
    name: string;
    slug: string;
}

export interface PublicProductResponse {
    product: PublicProductData;
    store: PublicStoreData;
}

export interface PublicCheckoutInput {
    productId?: string;
    productSlug?: string;
    storeSlug: string;
    buyerPhone: string;
    buyerEmail?: string;
}

export interface PublicCheckoutResult {
    orderId: string;
    orderStatus: string;
    totalAmountKobo: number;
    authorizationUrl: string;
}

// ===================
// PUBLIC PRODUCT FETCH (EPIC3-BACKEND-01)
// ===================

/**
 * Get public product data by store slug and product slug
 * 
 * Returns only public-facing data:
 * - Product name, price, currency, description
 * - Store name
 * 
 * No vendor-only fields exposed.
 */
export async function getPublicProduct(
    prisma: PrismaClient,
    storeSlug: string,
    productSlug: string
): Promise<PublicProductResponse | null> {
    // First, find the store by slug
    const store = await prisma.store.findUnique({
        where: { slug: storeSlug },
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            currency: true,
        },
    });

    if (!store) {
        logger.debug({ storeSlug }, 'Store not found');
        return null;
    }

    // Check if store is paused
    if (store.status === StoreStatus.PAUSED) {
        logger.debug({ storeSlug }, 'Store is paused');
        return null;
    }

    if (!store) {
        logger.debug({ storeSlug }, 'Store not found');
        return null;
    }

    // Then, find the product by slug within that store
    const product = await prisma.product.findFirst({
        where: {
            slug: productSlug,
            storeId: store.id,
            status: ProductStatus.ACTIVE,  // Only active products
        },
        select: {
            name: true,
            slug: true,
            description: true,
            price: true,
        },
    });

    if (!product) {
        logger.debug({ storeSlug, productSlug }, 'Product not found');
        return null;
    }

    return {
        product: {
            name: product.name,
            slug: product.slug,
            description: product.description,
            price: product.price,
            currency: store.currency,
        },
        store: {
            name: store.name,
            slug: store.slug,
        },
    };
}

/**
 * Get product by ID for checkout validation
 */
export async function getProductById(
    prisma: PrismaClient,
    productId: string
): Promise<{
    id: string;
    name: string;
    price: number;
    storeId: string;
    vendorId: string;
    currency: string;
} | null> {
    const product = await prisma.product.findFirst({
        where: {
            id: productId,
            status: ProductStatus.ACTIVE,
        },
        select: {
            id: true,
            name: true,
            price: true,
            storeId: true,
            store: {
                select: {
                    vendorId: true,
                    currency: true,
                    status: true,
                },
            },
        },
    });

    if (!product) {
        return null;
    }

    // Check if store is paused
    if (product.store.status === StoreStatus.PAUSED) {
        return null;
    }

    if (!product) {
        return null;
    }

    return {
        id: product.id,
        name: product.name,
        price: product.price,
        storeId: product.storeId,
        vendorId: product.store.vendorId,
        currency: product.store.currency,
    };
}

/**
 * Get product by slug for checkout validation
 */
export async function getProductBySlugAndStore(
    prisma: PrismaClient,
    productSlug: string,
    storeSlug: string
): Promise<{
    id: string;
    name: string;
    price: number;
    storeId: string;
    vendorId: string;
    currency: string;
} | null> {
    // First find the store
    const store = await prisma.store.findUnique({
        where: { slug: storeSlug },
        select: { id: true, vendorId: true, currency: true, status: true },
    });

    if (!store) {
        return null;
    }

    // Check if store is paused
    if (store.status === StoreStatus.PAUSED) {
        return null;
    }

    const product = await prisma.product.findFirst({
        where: {
            slug: productSlug,
            storeId: store.id,
            status: ProductStatus.ACTIVE,
        },
        select: {
            id: true,
            name: true,
            price: true,
            storeId: true,
        },
    });

    if (!product) {
        return null;
    }

    return {
        id: product.id,
        name: product.name,
        price: product.price,
        storeId: product.storeId,
        vendorId: store.vendorId,
        currency: store.currency,
    };
}
