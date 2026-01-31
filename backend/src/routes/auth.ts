import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPrismaClient } from '../lib/database.js';
import { createLogger } from '../lib/logger.js';
import { signupVendor, loginVendor } from '../services/auth.service.js';

const logger = createLogger('auth-route');

// ===================
// REQUEST SCHEMAS
// ===================

const signupSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    phone: z.string().min(10, 'Invalid phone number'),
    storeName: z.string().min(2, 'Store name must be at least 2 characters').max(100),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

// ===================
// ROUTE HANDLERS
// ===================

/**
 * POST /api/auth/signup
 * 
 * Register a new vendor account and create their store
 */
async function signupHandler(
    request: FastifyRequest<{
        Body: z.infer<typeof signupSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate input
        const parseResult = signupSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: parseResult.error.errors,
            });
        }

        const { email, password, phone, storeName } = parseResult.data;
        const prisma = getPrismaClient();

        const result = await signupVendor(prisma, { email, password, phone, storeName });

        logger.info({ vendorId: result.vendor.id, email }, 'Vendor signup successful');

        return reply.status(201).send({
            success: true,
            vendor: result.vendor,
            token: result.token,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message === 'EMAIL_EXISTS') {
            return reply.status(409).send({
                success: false,
                error: 'Email already registered',
            });
        }

        logger.error({ error: message }, 'Signup failed');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

/**
 * POST /api/auth/login
 * 
 * Authenticate vendor and return JWT
 */
async function loginHandler(
    request: FastifyRequest<{
        Body: z.infer<typeof loginSchema>;
    }>,
    reply: FastifyReply
) {
    try {
        // Validate input
        const parseResult = loginSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation error',
                details: parseResult.error.errors,
            });
        }

        const { email, password } = parseResult.data;
        const prisma = getPrismaClient();

        const result = await loginVendor(prisma, { email, password });

        logger.info({ vendorId: result.vendor.id, email }, 'Vendor login successful');

        return reply.status(200).send({
            success: true,
            vendor: result.vendor,
            token: result.token,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message === 'INVALID_CREDENTIALS') {
            return reply.status(401).send({
                success: false,
                error: 'Invalid email or password',
            });
        }

        logger.error({ error: message }, 'Login failed');

        return reply.status(500).send({
            success: false,
            error: 'Internal server error',
        });
    }
}

// ===================
// ROUTE REGISTRATION
// ===================

export async function authRoutes(fastify: FastifyInstance) {
    // Vendor signup
    fastify.post('/api/auth/signup', signupHandler);

    // Vendor login
    fastify.post('/api/auth/login', loginHandler);

    logger.debug('Auth routes registered');
}
