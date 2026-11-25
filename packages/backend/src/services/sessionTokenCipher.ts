import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { warnLog } from '@lucky/shared/utils'

/**
 * AES-256-GCM sealing for the Discord OAuth tokens kept in webapp sessions.
 *
 * Sealed format: `enc:v1:<iv>.<authTag>.<ciphertext>` (each part base64).
 * Each value is sealed with associated data (the session key and field
 * name), so a sealed token copied to another session or field fails the
 * auth tag check.
 *
 * Values without the prefix are legacy plaintext tokens written before
 * encryption existed; they are returned as is and re-sealed on the next write.
 */

const PREFIX = 'enc:v1:'
const SEALED_MARKER = 'enc:'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

export const SESSION_TOKEN_KEY_ENV = 'SESSION_TOKEN_KEY'

/**
 * Reads the token key from the environment.
 *
 * Production refuses to start without a key. In development and test a
 * missing key logs a warning and tokens are stored unencrypted (unlike
 * WEBAPP_SESSION_SECRET, which is required everywhere). A key that is set but
 * not 32 bytes always throws.
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

export function encryptToken(
    plaintext: string,
    key: Buffer,
    context: string,
): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    cipher.setAAD(Buffer.from(context, 'utf8'))
    const data = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ])
    const tag = cipher.getAuthTag()
    return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`
}

function decodeBase64Strict(part: string | undefined, bytes?: number): Buffer {
    const decoded = Buffer.from(part ?? '', 'base64')
    const canonical =
        part !== undefined &&
        part.length > 0 &&
        decoded.toString('base64') === part &&
        (bytes === undefined || decoded.length === bytes)
    if (!canonical) {
        throw new Error('Malformed encrypted session token')
    }
    return decoded
}

export function decryptToken(
    value: string,
    key: Buffer | null,
    context: string,
): string {
    if (!value.startsWith(SEALED_MARKER)) {
        return value
    }
    if (!value.startsWith(PREFIX)) {
        throw new Error('Unsupported encrypted session token version')
    }
    if (!key) {
        throw new Error(
            `Session token is encrypted but ${SESSION_TOKEN_KEY_ENV} is not set`,
        )
    }

    const parts = value.slice(PREFIX.length).split('.')
    if (parts.length !== 3) {
        throw new Error('Malformed encrypted session token')
    }
    const iv = decodeBase64Strict(parts[0], IV_BYTES)
    const tag = decodeBase64Strict(parts[1], TAG_BYTES)
    const data = decodeBase64Strict(parts[2])

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_BYTES,
    })
    decipher.setAAD(Buffer.from(context, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
        'utf8',
    )
}

export function isSealedToken(value: string): boolean {
    return value.startsWith(PREFIX)
}
