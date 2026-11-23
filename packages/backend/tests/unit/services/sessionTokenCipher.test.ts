import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { randomBytes } from 'node:crypto'

const mockWarnLog = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: mockWarnLog,
}))

import {
    decryptToken,
    encryptToken,
    loadSessionTokenKey,
} from '../../../src/services/sessionTokenCipher'

const KEY = randomBytes(32)
const AAD = 'webapp:session:abc:accessToken'

function tamperCiphertext(sealed: string): string {
    const [iv, tag, data] = sealed.slice('enc:v1:'.length).split('.')
    const bytes = Buffer.from(data, 'base64')
    bytes[0] ^= 0xff
    return `enc:v1:${iv}.${tag}.${bytes.toString('base64')}`
}

describe('sessionTokenCipher', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('encryptToken / decryptToken', () => {
        test('round trips a token', () => {
            const sealed = encryptToken('discord-access-token', KEY, AAD)

            expect(sealed.startsWith('enc:v1:')).toBe(true)
            expect(sealed).not.toContain('discord-access-token')
            expect(decryptToken(sealed, KEY, AAD)).toBe('discord-access-token')
        })

        test('uses a fresh IV for every encryption', () => {
            expect(encryptToken('same', KEY, AAD)).not.toBe(
                encryptToken('same', KEY, AAD),
            )
        })

        test('rejects a tampered ciphertext', () => {
            const sealed = encryptToken('discord-access-token', KEY, AAD)

            expect(() =>
                decryptToken(tamperCiphertext(sealed), KEY, AAD),
            ).toThrow()
        })

        test('rejects a tampered auth tag', () => {
            const sealed = encryptToken('discord-access-token', KEY, AAD)
            const [iv, tag, data] = sealed.slice('enc:v1:'.length).split('.')
            const badTag = Buffer.from(tag, 'base64')
            badTag[0] ^= 0xff
            const tampered = `enc:v1:${iv}.${badTag.toString('base64')}.${data}`

            expect(() => decryptToken(tampered, KEY, AAD)).toThrow()
        })

        test('rejects a value sealed with another key', () => {
            const sealed = encryptToken('discord-access-token', KEY, AAD)

            expect(() => decryptToken(sealed, randomBytes(32), AAD)).toThrow()
        })

        test('rejects a token moved to another session or field', () => {
            const sealed = encryptToken('discord-access-token', KEY, AAD)

            expect(() =>
                decryptToken(sealed, KEY, 'webapp:session:xyz:accessToken'),
            ).toThrow()
            expect(() =>
                decryptToken(sealed, KEY, 'webapp:session:abc:refreshToken'),
            ).toThrow()
        })

        test('returns legacy plaintext tokens unchanged', () => {
            expect(decryptToken('legacy-plain-token', KEY, AAD)).toBe(
                'legacy-plain-token',
            )
            expect(decryptToken('legacy-plain-token', null, AAD)).toBe(
                'legacy-plain-token',
            )
        })

        test('rejects extra segments and non canonical base64', () => {
            const sealed = encryptToken('discord-access-token', KEY, AAD)

            expect(() => decryptToken(`${sealed}.junk`, KEY, AAD)).toThrow(
                'Malformed',
            )
            expect(() => decryptToken(`${sealed}!`, KEY, AAD)).toThrow(
                'Malformed',
            )
        })

        test('rejects unknown enc: versions instead of treating them as plaintext', () => {
            expect(() => decryptToken('enc:v2:abc.def.ghi', KEY, AAD)).toThrow(
                'Unsupported',
            )
        })

        test('refuses to read an encrypted token without a key', () => {
            const sealed = encryptToken('discord-access-token', KEY, AAD)

            expect(() => decryptToken(sealed, null, AAD)).toThrow(
                'SESSION_TOKEN_KEY',
            )
        })
    })

    describe('loadSessionTokenKey', () => {
        test('decodes a 32 byte base64 key', () => {
            const key = loadSessionTokenKey({
                SESSION_TOKEN_KEY: KEY.toString('base64'),
                NODE_ENV: 'production',
            })

            expect(key?.equals(KEY)).toBe(true)
        })

        test('throws in production when the key is missing', () => {
            expect(() =>
                loadSessionTokenKey({ NODE_ENV: 'production' }),
            ).toThrow('SESSION_TOKEN_KEY environment variable is required')
        })

        test('throws in production when the key is blank', () => {
            expect(() =>
                loadSessionTokenKey({
                    NODE_ENV: 'production',
                    SESSION_TOKEN_KEY: '   ',
                }),
            ).toThrow('SESSION_TOKEN_KEY environment variable is required')
        })

        test('warns and returns null outside production', () => {
            expect(loadSessionTokenKey({ NODE_ENV: 'development' })).toBeNull()
            expect(mockWarnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('SESSION_TOKEN_KEY'),
                }),
            )
        })

        test('throws when the key is not 32 bytes', () => {
            expect(() =>
                loadSessionTokenKey({
                    NODE_ENV: 'development',
                    SESSION_TOKEN_KEY: randomBytes(16).toString('base64'),
                }),
            ).toThrow('32 bytes')
        })
    })
})
