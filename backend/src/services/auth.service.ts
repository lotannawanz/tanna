import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient, Vendor } from '@prisma/client';
import { env } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('auth-service');

// ===================
// CONSTANTS
// ===================

const SALT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

// ===================
// TYPES
// ===================

export interface SignupInput {
    email: string;
    password: string;
    phone: string;
    storeName: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface JWTPayload {
    vendorId: string;
    storeId: string | null;
    iat?: number;
    exp?: number;
}

export interface AuthResult {
    vendor: {
        id: string;
        email: string;
        phone: string;
        store?: {
            id: string;
            name: string;
            slug: string;
        };
    };
    token: string;
}

// ===================
// HELPER FUNCTIONS
// ===================

/**
 * Generate a URL-safe slug from a store name
 */
function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-')          // Replace spaces with hyphens
        .replace(/-+/g, '-')           // Collapse multiple hyphens
        .slice(0, 50);                 // Limit length
}

// ===================
// SERVICE FUNCTIONS
// ===================

/**
 * Sign up a new vendor with email/password and create their store
 */
export async function signupVendor(
    prisma: PrismaClient,
    input: SignupInput
): Promise<AuthResult> {
    const { email, password, phone, storeName } = input;

    // Check if vendor already exists
    const existingVendor = await prisma.vendor.findUnique({
        where: { email: email.toLowerCase() },
    });

    if (existingVendor) {
        throw new Error('EMAIL_EXISTS');
    }

    // Generate slug from store name
    let slug = generateSlug(storeName);

    // Check slug uniqueness, append random suffix if needed
    const existingSlug = await prisma.store.findUnique({
        where: { slug },
    });

    if (existingSlug) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create vendor AND store in one transaction
    const vendor = await prisma.vendor.create({
        data: {
            email: email.toLowerCase(),
            passwordHash,
            phone,
            store: {
                create: {
                    name: storeName,
                    slug,
                    currency: 'NGN',
                },
            },
        },
        include: {
            store: true,
        },
    });

    logger.info({
        vendorId: vendor.id,
        email: vendor.email,
        storeName: vendor.store?.name,
        storeSlug: vendor.store?.slug,
    }, 'Vendor and store created');

    // Generate JWT (with storeId now available)
    const token = generateToken(vendor.id, vendor.store?.id || null);

    return {
        vendor: {
            id: vendor.id,
            email: vendor.email,
            phone: vendor.phone,
            store: vendor.store ? {
                id: vendor.store.id,
                name: vendor.store.name,
                slug: vendor.store.slug,
            } : undefined,
        },
        token,
    };
}

/**
 * Log in an existing vendor with email and password
 */
export async function loginVendor(
    prisma: PrismaClient,
    input: LoginInput
): Promise<AuthResult> {
    const { email, password } = input;

    // Find vendor by email
    const vendor = await prisma.vendor.findUnique({
        where: { email: email.toLowerCase() },
        include: {
            store: true,
        },
    });

    if (!vendor) {
        throw new Error('INVALID_CREDENTIALS');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, vendor.passwordHash);

    if (!passwordValid) {
        throw new Error('INVALID_CREDENTIALS');
    }

    logger.info({ vendorId: vendor.id, email: vendor.email }, 'Vendor logged in');

    // Generate JWT
    const token = generateToken(vendor.id, vendor.store?.id || null);

    return {
        vendor: {
            id: vendor.id,
            email: vendor.email,
            phone: vendor.phone,
            store: vendor.store ? {
                id: vendor.store.id,
                name: vendor.store.name,
                slug: vendor.store.slug,
            } : undefined,
        },
        token,
    };
}

/**
 * Verify a JWT token and return the payload
 */
export function verifyToken(token: string): JWTPayload {
    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
        return payload;
    } catch (error) {
        throw new Error('INVALID_TOKEN');
    }
}

/**
 * Get vendor by ID with store info (for refreshing storeId in middleware)
 */
export async function getVendorWithStore(
    prisma: PrismaClient,
    vendorId: string
): Promise<(Vendor & { store: { id: string } | null }) | null> {
    return prisma.vendor.findUnique({
        where: { id: vendorId },
        include: {
            store: {
                select: { id: true },
            },
        },
    });
}

// ===================
// HELPER FUNCTIONS
// ===================

function generateToken(vendorId: string, storeId: string | null): string {
    const payload: JWTPayload = {
        vendorId,
        storeId,
    };

    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: JWT_EXPIRY,
    });
}
