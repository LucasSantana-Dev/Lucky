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
            const sealed = encryptToken('discord-access-token', KEY)

            expect(sealed.startsWith('enc:v1:')).toBe(true)
            expect(sealed).not.toContain('discord-access-token')
            expect(decryptToken(sealed, KEY)).toBe('discord-access-token')
        })

        test('uses a fresh IV for every encryption', () => {
            expect(encryptToken('same', KEY)).not.toBe(
                encryptToken('same', KEY),
            )
        })

        test('rejects a tampered ciphertext', () => {
            const sealed = encryptToken('discord-access-token', KEY)

            expect(() => decryptToken(tamperCiphertext(sealed), KEY)).toThrow()
        })

        test('rejects a tampered auth tag', () => {
            const sealed = encryptToken('discord-access-token', KEY)
            const [iv, tag, data] = sealed.slice('enc:v1:'.length).split('.')
            const badTag = Buffer.from(tag, 'base64')
            badTag[0] ^= 0xff
            const tampered = `enc:v1:${iv}.${badTag.toString('base64')}.${data}`

            expect(() => decryptToken(tampered, KEY)).toThrow()
        })

        test('rejects a value sealed with another key', () => {
            const sealed = encryptToken('discord-access-token', KEY)

            expect(() => decryptToken(sealed, randomBytes(32))).toThrow()
        })

        test('returns legacy plaintext tokens unchanged', () => {
            expect(decryptToken('legacy-plain-token', KEY)).toBe(
                'legacy-plain-token',
            )
            expect(decryptToken('legacy-plain-token', null)).toBe(
                'legacy-plain-token',
            )
        })

        test('refuses to read an encrypted token without a key', () => {
            const sealed = encryptToken('discord-access-token', KEY)

            expect(() => decryptToken(sealed, null)).toThrow(
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
