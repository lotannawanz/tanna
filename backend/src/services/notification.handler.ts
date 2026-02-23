/**
 * Notification handler module.
 *
 * DEPRECATED: This module previously handled inline WhatsApp notifications
 * via an in-process event bus. Notifications are now processed durably
 * via the job queue (SEND_WHATSAPP jobs).
 *
 * This file is kept as a no-op to avoid breaking any existing imports
 * during the transition. It can be safely deleted once all references
 * are confirmed removed.
 */

import { createLogger } from '../lib/logger.js';

const logger = createLogger('notification-handler');

/**
 * No-op — notification handlers are now managed by the worker process.
 */
export function registerNotificationHandlers(): void {
    logger.info('Notification handlers deprecated — using job queue instead');
}
