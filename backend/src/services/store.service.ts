import { PrismaClient, Store } from '@prisma/client';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('store-service');

// ===================
// TYPES
// ===================

export interface CreateStoreInput {
    vendorId: string;
    name: string;
    slug: string;
    currency?: string;
    deliveryEstimateText?: string;
}

// ===================
// STORE EVENT (Epic 1)
// ===================

export type StoreEventType = 'STORE_CREATED';

export interface StoreEvent {
    type: StoreEventType;
    storeId: string;
    vendorId: string;
    name: string;
    slug: string;
    timestamp: Date;
}

// Simple event handler storage
const storeEventHandlers: Array<(event: StoreEvent) => Promise<void>> = [];

export function subscribeToStoreEvents(handler: (event: StoreEvent) => Promise<void>): void {
    storeEventHandlers.push(handler);
    logger.debug(`Store event handler registered. Total handlers: ${storeEventHandlers.length}`);
}

async function emitStoreEvent(event: StoreEvent): Promise<void> {
    logger.info({
        eventType: event.type,
        storeId: event.storeId,
        vendorId: event.vendorId,
        name: event.name,
        slug: event.slug,
        timestamp: event.timestamp.toISOString(),
    }, `Store event emitted: ${event.type}`);

    // Dispatch to handlers (non-blocking)
    for (const handler of storeEventHandlers) {
        setImmediate(async () => {
            try {
                await handler(event);
            } catch (error) {
                logger.error({
                    eventType: event.type,
                    storeId: event.storeId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                }, 'Store event handler failed');
            }
        });
    }
}

// ===================
// SERVICE FUNCTIONS
// ===================

/**
 * Create a new store for a vendor
 * 
 * Enforces 1:1 relationship - vendor can only have one store.
 * Validates slug uniqueness.
 */
export async function createStore(
    prisma: PrismaClient,
    input: CreateStoreInput
): Promise<Store> {
    const { vendorId, name, slug, currency = 'NGN', deliveryEstimateText } = input;

    // Check if vendor already has a store
    const existingStore = await prisma.store.findUnique({
        where: { vendorId },
    });

    if (existingStore) {
        throw new Error('VENDOR_HAS_STORE');
    }

    // Validate slug format (lowercase, alphanumeric, hyphens only)
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
        throw new Error('INVALID_SLUG');
    }

    // Check slug uniqueness
    const existingSlug = await prisma.store.findUnique({
        where: { slug },
    });

    if (existingSlug) {
        throw new Error('SLUG_EXISTS');
    }

    // Create the store
    const store = await prisma.store.create({
        data: {
            vendorId,
            name,
            slug,
            currency,
            deliveryEstimateText,
        },
    });

    logger.info({
        storeId: store.id,
        vendorId,
        name,
        slug,
    }, 'Store created');

    // Emit STORE_CREATED event
    await emitStoreEvent({
        type: 'STORE_CREATED',
        storeId: store.id,
        vendorId,
        name,
        slug,
        timestamp: new Date(),
    });

    return store;
}

/**
 * Get a store by vendor ID
 */
export async function getStoreByVendorId(
    prisma: PrismaClient,
    vendorId: string
): Promise<Store | null> {
    return prisma.store.findUnique({
        where: { vendorId },
    });
}

/**
 * Get a store by slug (for public access)
 */
export async function getStoreBySlug(
    prisma: PrismaClient,
    slug: string
): Promise<Store | null> {
    return prisma.store.findUnique({
        where: { slug },
    });
}
