import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import {
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    MOCK_SESSION_DATA,
    MOCK_SESSION_ID,
    MOCK_EXPIRED_SESSION_DATA,
} from '../../fixtures/mock-data'
import type { AsyncMockFn } from '../../fixtures/mock-types'

const mockRedisClient = {
    isHealthy: jest.fn(() => true),
    get: jest.fn<AsyncMockFn>(),
    set: jest.fn(),
    setex: jest.fn<AsyncMockFn>(),
    del: jest.fn<AsyncMockFn>(),
}

jest.mock('@lucky/shared/services', () => ({
    redisClient: mockRedisClient,
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

import {
    SessionService,
    sessionService,
    type SessionData,
} from '../../../src/services/SessionService'

function storedRaw(): string {
    return mockRedisClient.setex.mock.calls[0][2] as string
}

function storedPayload(): SessionData {
    return JSON.parse(storedRaw()) as SessionData
}

describe('SessionService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRedisClient.isHealthy.mockReturnValue(true)
    })

    describe('getSession', () => {
        test('should read a legacy plaintext session', async () => {
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(MOCK_SESSION_DATA),
            )

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toEqual(MOCK_SESSION_DATA)
            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should return null when session not found', async () => {
            mockRedisClient.get.mockResolvedValue(null)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
        })

        test('should return null and delete when session expired', async () => {
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(MOCK_EXPIRED_SESSION_DATA),
            )
            mockRedisClient.del.mockResolvedValue(true)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
            expect(mockRedisClient.del).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should return null when Redis is unavailable', async () => {
            mockRedisClient.isHealthy.mockReturnValue(false)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
            expect(mockRedisClient.get).not.toHaveBeenCalled()
        })

        test('should return null on JSON parse error', async () => {
            mockRedisClient.get.mockResolvedValue('invalid json')

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
        })
    })

    describe('setSession', () => {
        test('should store session successfully', async () => {
            mockRedisClient.setex.mockResolvedValue(true)

            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
                7 * 24 * 60 * 60,
                expect.any(String),
            )
        })

        test('should encrypt the OAuth tokens at rest', async () => {
            mockRedisClient.setex.mockResolvedValue(true)

            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            const stored = storedPayload()
            expect(stored.accessToken.startsWith('enc:v1:')).toBe(true)
            expect(stored.refreshToken.startsWith('enc:v1:')).toBe(true)
            expect(storedRaw()).not.toContain(MOCK_SESSION_DATA.accessToken)
            expect(storedRaw()).not.toContain(MOCK_SESSION_DATA.refreshToken)
            expect(stored.userId).toBe(MOCK_SESSION_DATA.userId)
        })

        test('should round trip an encrypted session', async () => {
            mockRedisClient.setex.mockResolvedValue(true)
            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)
            mockRedisClient.get.mockResolvedValue(storedRaw())

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toEqual(MOCK_SESSION_DATA)
        })

        test('should reject a session whose token was tampered with', async () => {
            mockRedisClient.setex.mockResolvedValue(true)
            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)
            const stored = storedPayload()
            const [iv, tag, data] = stored.accessToken
                .slice('enc:v1:'.length)
                .split('.')
            const bytes = Buffer.from(data, 'base64')
            bytes[0] ^= 0xff
            stored.accessToken = `enc:v1:${iv}.${tag}.${bytes.toString('base64')}`
            mockRedisClient.get.mockResolvedValue(JSON.stringify(stored))

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
        })

        test('should not store when Redis is unavailable', async () => {
            mockRedisClient.isHealthy.mockReturnValue(false)

            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            expect(mockRedisClient.setex).not.toHaveBeenCalled()
        })

        test('should throw error on Redis failure', async () => {
            mockRedisClient.setex.mockRejectedValue(new Error('Redis error'))

            await expect(
                sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA),
            ).rejects.toThrow('Redis error')
        })
    })

    describe('deleteSession', () => {
        test('should delete session successfully', async () => {
            mockRedisClient.del.mockResolvedValue(true)

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedisClient.del).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should not delete when Redis is unavailable', async () => {
            mockRedisClient.isHealthy.mockReturnValue(false)

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedisClient.del).not.toHaveBeenCalled()
        })

        test('should handle delete errors gracefully', async () => {
            mockRedisClient.del.mockRejectedValue(new Error('Redis error'))

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedisClient.del).toHaveBeenCalled()
        })
    })

    describe('updateSession', () => {
        test('should update session successfully', async () => {
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(MOCK_SESSION_DATA),
            )
            mockRedisClient.setex.mockResolvedValue(true)

            const updates = { accessToken: 'new_token' }
            await sessionService.updateSession(MOCK_SESSION_ID, updates)

            expect(mockRedisClient.get).toHaveBeenCalled()
            expect(mockRedisClient.setex).toHaveBeenCalled()
        })

        test('should throw error when session not found', async () => {
            mockRedisClient.get.mockResolvedValue(null)

            await expect(
                sessionService.updateSession(MOCK_SESSION_ID, {}),
            ).rejects.toThrow('Session not found')
        })
    })

    describe('missing SESSION_TOKEN_KEY', () => {
        const originalKey = process.env.SESSION_TOKEN_KEY
        const originalEnv = process.env.NODE_ENV

        afterEach(() => {
            process.env.SESSION_TOKEN_KEY = originalKey
            process.env.NODE_ENV = originalEnv
        })

        test('refuses to start in production', () => {
            delete process.env.SESSION_TOKEN_KEY
            process.env.NODE_ENV = 'production'

            expect(() => new SessionService({ sessionFile: 'unused' })).toThrow(
                'SESSION_TOKEN_KEY environment variable is required',
            )
        })

        test('keeps working without encryption outside production', async () => {
            delete process.env.SESSION_TOKEN_KEY
            process.env.NODE_ENV = 'development'
            mockRedisClient.setex.mockResolvedValue(true)
            const service = new SessionService({ sessionFile: 'unused' })

            await service.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            expect(storedPayload().accessToken).toBe(
                MOCK_SESSION_DATA.accessToken,
            )
        })
    })

    describe('file fallback', () => {
        let dir: string
        let sessionFile: string

        beforeEach(() => {
            mockRedisClient.isHealthy.mockReturnValue(false)
            dir = mkdtempSync(join(tmpdir(), 'lucky-sessions-'))
            sessionFile = join(dir, 'nested', 'sessions.json')
        })

        afterEach(() => {
            rmSync(dir, { recursive: true, force: true })
        })

        test('persists encrypted sessions atomically and reloads them', async () => {
            const service = new SessionService({ sessionFile })

            await service.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            const raw = readFileSync(sessionFile, 'utf-8')
            expect(raw).not.toContain(MOCK_SESSION_DATA.accessToken)
            expect(raw).not.toContain(MOCK_SESSION_DATA.refreshToken)
            expect(readdirSync(join(dir, 'nested'))).toEqual(['sessions.json'])

            const reloaded = new SessionService({ sessionFile })
            expect(await reloaded.getSession(MOCK_SESSION_ID)).toEqual(
                MOCK_SESSION_DATA,
            )
        })

        test('keeps the last write when writes overlap', async () => {
            const service = new SessionService({ sessionFile })

            await Promise.all([
                service.setSession('a', MOCK_SESSION_DATA),
                service.setSession('b', MOCK_SESSION_DATA),
                service.deleteSession('a'),
            ])

            const entries = JSON.parse(readFileSync(sessionFile, 'utf-8')) as [
                string,
                string,
            ][]
            expect(entries.map(([key]) => key)).toEqual(['webapp:session:b'])
        })

        test('reads a legacy plaintext file and re-encrypts it on write', async () => {
            const legacyFile = join(dir, 'sessions.json')
            writeFileSync(
                legacyFile,
                JSON.stringify([
                    [
                        `webapp:session:${MOCK_SESSION_ID}`,
                        JSON.stringify(MOCK_SESSION_DATA),
                    ],
                ]),
            )
            const service = new SessionService({ sessionFile: legacyFile })

            expect(await service.getSession(MOCK_SESSION_ID)).toEqual(
                MOCK_SESSION_DATA,
            )

            await service.setSession('other', MOCK_SESSION_DATA)

            const raw = readFileSync(legacyFile, 'utf-8')
            expect(raw).not.toContain(MOCK_SESSION_DATA.accessToken)
            expect(raw).not.toContain(MOCK_SESSION_DATA.refreshToken)
        })
    })
})
