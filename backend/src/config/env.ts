import { z } from 'zod';
import { config } from 'dotenv';
import { resolve } from 'path';

// Determine environment file to load
const NODE_ENV = process.env.NODE_ENV || 'local';
const envFile = `.env.${NODE_ENV}`;

// Load environment-specific file
config({ path: resolve(process.cwd(), envFile) });

// Fallback to .env if environment-specific file doesn't exist
config({ path: resolve(process.cwd(), '.env') });

/**
 * Environment configuration schema
 * Validates all required environment variables at startup
 */
const envSchema = z.object({
    // Environment
    NODE_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    PORT: z.string().transform(Number).default('3000'),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Paystack (required for Epic 4)
    PAYSTACK_SECRET_KEY: z.string().min(1, 'PAYSTACK_SECRET_KEY is required'),
    PAYSTACK_PUBLIC_KEY: z.string().min(1, 'PAYSTACK_PUBLIC_KEY is required'),
    PAYSTACK_WEBHOOK_SECRET: z.string().min(1, 'PAYSTACK_WEBHOOK_SECRET is required'),

    // WhatsApp (optional in v0, required later)
    WHATSAPP_API_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),

    // Monitoring (optional)
    SLACK_WEBHOOK_URL: z.string().optional(),

    // Escalation (optional — for CRITICAL alerts)
    PAGERDUTY_WEBHOOK_URL: z.string().url().optional(),
    PAGERDUTY_ROUTING_KEY: z.string().optional(),

    // Auth (Epic 1)
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

    // Admin Dashboard
    ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters').optional(),
    ADMIN_DASHBOARD_ENABLED: z.string().transform((v) => v === 'true').default('false'),

    // CORS
    FRONTEND_URL: z.string().url().optional(),
});

/**
 * Parsed and validated environment configuration
 * Throws at startup if required variables are missing
 */
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parseResult.error.format());
    process.exit(1);
}

export const env = parseResult.data;

/**
 * Type-safe environment accessor
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Check if we're in production
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Check if we're in local development
 */
export const isLocal = env.NODE_ENV === 'local';
