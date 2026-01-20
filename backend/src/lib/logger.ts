import pino from 'pino';
import { env, isLocal } from '../config/env.js';

/**
 * Structured logger for Tanna backend
 * 
 * - Local: Pretty-printed for readability
 * - Production: JSON for log aggregation
 */
export const logger = pino({
    level: isLocal ? 'debug' : 'info',

    // Add environment context to all logs
    base: {
        env: env.NODE_ENV,
        service: 'tanna-backend',
    },

    // Pretty print in local development
    transport: isLocal
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
            },
        }
        : undefined,

    // Redact sensitive fields
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'payload.password',
        ],
        censor: '[REDACTED]',
    },
});

/**
 * Child logger factory for specific modules
 */
export function createLogger(module: string) {
    return logger.child({ module });
}

/**
 * Request logger for Fastify
 */
export const requestLogger = {
    logger,
    serializers: {
        req: (req: { method: string; url: string }) => ({
            method: req.method,
            url: req.url,
        }),
        res: (res: { statusCode: number }) => ({
            statusCode: res.statusCode,
        }),
    },
};
