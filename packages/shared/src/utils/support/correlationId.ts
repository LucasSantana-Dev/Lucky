import { randomBytes } from 'crypto'
import { isSentryEnabled } from '../monitoring/sentry'
import * as Sentry from '@sentry/node'

const CHARSET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Mints a short, URL-safe correlation ID for tracking errors across logs and Sentry.
 * Format: 8 base62-like characters drawn from a URL-safe alphabet.
 * Non-empty, stable across multiple calls (creates a new ID each time).
 *
 * @returns A 8-character URL-safe correlation ID
 */
export function mintCorrelationId(): string {
    // Generate 6 bytes of random data = 48 bits, enough for 8 base62-like chars
    const bytes = randomBytes(6)
    let id = ''
    for (let i = 0; i < bytes.length; i++) {
        id += CHARSET[bytes[i] % CHARSET.length]
    }
    return id
}

/**
 * Attaches a correlation ID as a Sentry tag for cross-referencing.
 * If Sentry is disabled, this is a no-op (graceful).
 *
 * @param correlationId The correlation ID to tag
 */
export function tagCorrelationIdToSentry(correlationId: string): void {
    if (!isSentryEnabled()) {
        return
    }
    Sentry.setTag('correlationId', correlationId)
}
