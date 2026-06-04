import { randomInt } from 'crypto'
import { isSentryEnabled } from '../monitoring/sentry'
import * as Sentry from '@sentry/node'

const CHARSET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const ID_LENGTH = 8

/**
 * Mints a short, URL-safe correlation ID for tracking errors across logs and Sentry.
 * Returns a fresh, non-empty 8-character id on every call (the shape is stable;
 * the value is not).
 *
 * @returns A fresh 8-character URL-safe correlation ID
 */
export function mintCorrelationId(): string {
    // randomInt draws uniformly from [0, CHARSET.length) with no modulo bias.
    let id = ''
    for (let i = 0; i < ID_LENGTH; i++) {
        id += CHARSET[randomInt(CHARSET.length)]
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
