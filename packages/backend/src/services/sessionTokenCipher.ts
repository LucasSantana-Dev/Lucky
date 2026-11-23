import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { warnLog } from '@lucky/shared/utils'

/**
 * AES-256-GCM sealing for the Discord OAuth tokens kept in webapp sessions.
 *
 * Sealed format: `enc:v1:<iv>.<authTag>.<ciphertext>` (each part base64).
 * Values without the prefix are legacy plaintext tokens written before
 * encryption existed; they are returned as is and re-sealed on the next write.
 */

const PREFIX = 'enc:v1:'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

export const SESSION_TOKEN_KEY_ENV = 'SESSION_TOKEN_KEY'

/**
 * Reads the token key from the environment.
 *
 * Production refuses to start without a key (same policy as
 * WEBAPP_SESSION_SECRET). Elsewhere a missing key logs a warning and tokens
 * are stored unencrypted. A key that is set but not 32 bytes always throws.
 */
export function loadSessionTokenKey(
    env: NodeJS.ProcessEnv = process.env,
): Buffer | null {
    const raw = env[SESSION_TOKEN_KEY_ENV]?.trim()

    if (!raw) {
        if (env.NODE_ENV === 'production') {
            throw new Error(
                `${SESSION_TOKEN_KEY_ENV} environment variable is required in production. Generate one with: openssl rand -base64 32`,
            )
        }
        warnLog({
            message: `${SESSION_TOKEN_KEY_ENV} is not set: Discord OAuth tokens in webapp sessions are stored unencrypted. Set it before deploying.`,
        })
        return null
    }

    const key = Buffer.from(raw, 'base64')
    if (key.length !== KEY_BYTES) {
        throw new Error(
            `${SESSION_TOKEN_KEY_ENV} must be ${KEY_BYTES} bytes, base64-encoded`,
        )
    }
    return key
}

export function encryptToken(plaintext: string, key: Buffer): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const data = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ])
    const tag = cipher.getAuthTag()
    return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`
}

export function decryptToken(value: string, key: Buffer | null): string {
    if (!value.startsWith(PREFIX)) {
        return value
    }
    if (!key) {
        throw new Error(
            `Session token is encrypted but ${SESSION_TOKEN_KEY_ENV} is not set`,
        )
    }

    const [iv, tag, data] = value.slice(PREFIX.length).split('.')
    if (!iv || !tag || data === undefined) {
        throw new Error('Malformed encrypted session token')
    }

    const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'base64'),
        {
            authTagLength: TAG_BYTES,
        },
    )
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]).toString('utf8')
}
