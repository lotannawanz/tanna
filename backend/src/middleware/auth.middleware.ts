import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, getVendorWithStore } from '../services/auth.service.js';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('auth-middleware');

// ===================
// TYPE EXTENSIONS
// ===================

declare module 'fastify' {
    interface FastifyRequest {
        vendorId?: string;
        storeId?: string | null;
    }
}

// ===================
// MIDDLEWARE
// ===================

/**
 * Auth middleware for protected routes
 * 
 * Validates JWT from Authorization header and attaches vendor info to request.
 * Also refreshes storeId from database to ensure it's current.
 */
export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.debug('Missing or invalid Authorization header');
        return reply.status(401).send({
            success: false,
            error: 'Unauthorized',
            message: 'Missing or invalid Authorization header',
        });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
        // Verify JWT
        const payload = verifyToken(token);

        // Fetch fresh vendor data to get current storeId
        const prisma = getPrismaClient();
        const vendor = await getVendorWithStore(prisma, payload.vendorId);

        if (!vendor) {
            logger.warn({ vendorId: payload.vendorId }, 'Vendor from token not found in database');
            return reply.status(401).send({
                success: false,
                error: 'Unauthorized',
                message: 'Vendor not found',
            });
        }

        // Attach to request
        request.vendorId = vendor.id;
        request.storeId = vendor.store?.id || null;

        logger.info({
            vendorId: vendor.id,
            storeId: request.storeId,
            hasStore: !!vendor.store
        }, 'Auth middleware resolved vendor and store');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message === 'INVALID_TOKEN') {
            logger.debug('Invalid or expired token');
            return reply.status(401).send({
                success: false,
                error: 'Unauthorized',
                message: 'Invalid or expired token',
            });
        }

        logger.error({ error: message }, 'Auth middleware error');
        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * Ownership middleware for vendor-scoped routes
 * 
 * Ensures the URL vendorId matches the authenticated vendor's ID.
 * Must be used AFTER authMiddleware.
 */
export async function ownershipMiddleware(
    request: FastifyRequest<{ Params: { vendorId?: string } }>,
    reply: FastifyReply
): Promise<void> {
    const urlVendorId = request.params.vendorId;

    if (!urlVendorId) {
        return; // Not a vendor-scoped route
    }

    if (!request.vendorId) {
        logger.warn('Ownership middleware called without auth middleware');
        return reply.status(401).send({
            success: false,
            error: 'Unauthorized',
        });
    }

    if (urlVendorId !== request.vendorId) {
        logger.warn({
            urlVendorId,
            tokenVendorId: request.vendorId,
        }, 'Cross-vendor access attempt blocked');

        return reply.status(403).send({
            success: false,
            error: 'Forbidden',
            message: 'You do not have access to this resource',
        });
    }
}
