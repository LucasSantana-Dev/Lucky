import { describe, test, expect, jest, beforeEach } from '@jest/globals'

global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

import {
    getTwitchEnv,
    isTwitchConfigured,
    getTwitchUserAccessToken,
    clearTwitchTokenCache,
} from './token.js'

const fetchMock = global.fetch as jest.MockedFunction<any>

beforeEach(() => {
    jest.clearAllMocks()
    clearTwitchTokenCache()
    delete process.env.TWITCH_CLIENT_ID
    delete process.env.TWITCH_CLIENT_SECRET
    delete process.env.TWITCH_ACCESS_TOKEN
    delete process.env.TWITCH_REFRESH_TOKEN
})

describe('token', () => {
    describe('getTwitchEnv', () => {
        test('returns all environment variables', () => {
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = 'token-789'
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-000'

            const env = getTwitchEnv()

            expect(env).toEqual({
                clientId: 'client-123',
                clientSecret: 'secret-456',
                accessToken: 'token-789',
                refreshToken: 'refresh-000',
            })
        })

        test('returns undefined for missing refresh token', () => {
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = 'token-789'

            const env = getTwitchEnv()

            expect(env.refreshToken).toBeUndefined()
        })

        test('returns empty strings for missing required fields', () => {
            const env = getTwitchEnv()

            expect(env.clientId).toBe('')
            expect(env.clientSecret).toBe('')
            expect(env.accessToken).toBeUndefined()
        })
    })

    describe('isTwitchConfigured', () => {
        test('returns true when all required fields present', () => {
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = 'token-789'

            expect(isTwitchConfigured()).toBe(true)
        })

        test('returns false when client ID missing', () => {
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = 'token-789'

            expect(isTwitchConfigured()).toBe(false)
        })

        test('returns false when client secret missing', () => {
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_ACCESS_TOKEN = 'token-789'

            expect(isTwitchConfigured()).toBe(false)
        })

        test('returns false when access token missing', () => {
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'

            expect(isTwitchConfigured()).toBe(false)
        })

        test('returns false when all fields missing', () => {
            expect(isTwitchConfigured()).toBe(false)
        })
    })

    describe('getTwitchUserAccessToken', () => {
        test('returns cached token if not expired', async () => {
            const token = 'cached-token-123'
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = token

            const result1 = await getTwitchUserAccessToken()
            const result2 = await getTwitchUserAccessToken()

            expect(result1).toBe(token)
            expect(result2).toBe(token)
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('returns null when not configured', async () => {
            const result = await getTwitchUserAccessToken()

            expect(result).toBeNull()
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('refreshes token when expired', async () => {
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = 'old-token'
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: 'new-token',
                    expires_in: 3600,
                }),
            })

            jest.useFakeTimers()
            const now = Date.now()
            jest.setSystemTime(now + 5 * 60 * 60 * 1000)

            const result = await getTwitchUserAccessToken()

            expect(result).toBe('new-token')
            expect(fetchMock).toHaveBeenCalledWith(
                'https://id.twitch.tv/oauth2/token',
                expect.objectContaining({
                    method: 'POST',
                }),
            )

            jest.useRealTimers()
        })

        test('uses environment token when refresh fails', async () => {
            const token = 'env-token'
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = token
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'

            fetchMock.mockResolvedValueOnce({
                ok: false,
            })

            jest.useFakeTimers()
            const now = Date.now()
            jest.setSystemTime(now + 5 * 60 * 60 * 1000)

            const result = await getTwitchUserAccessToken()

            expect(result).toBe(token)

            jest.useRealTimers()
        })

        test('sends correct refresh token request body', async () => {
            process.env.TWITCH_CLIENT_ID = 'client-id-xyz'
            process.env.TWITCH_CLIENT_SECRET = 'secret-xyz'
            process.env.TWITCH_ACCESS_TOKEN = 'old-token'
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-xyz'

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: 'new-token',
                    expires_in: 3600,
                }),
            })

            jest.useFakeTimers()
            const now = Date.now()
            jest.setSystemTime(now + 5 * 60 * 60 * 1000)

            await getTwitchUserAccessToken()

            const call = fetchMock.mock.calls[0]
            const bodyStr = call[1].body.toString()

            expect(bodyStr).toContain('client_id=client-id-xyz')
            expect(bodyStr).toContain('client_secret=secret-xyz')
            expect(bodyStr).toContain('grant_type=refresh_token')
            expect(bodyStr).toContain('refresh_token=refresh-xyz')

            jest.useRealTimers()
        })

        test('sends correct refresh token request parameters', async () => {
            process.env.TWITCH_CLIENT_ID = 'client-id-xyz'
            process.env.TWITCH_CLIENT_SECRET = 'secret-xyz'
            process.env.TWITCH_ACCESS_TOKEN = 'old-token'
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-xyz'

            jest.useFakeTimers()
            const now = Date.now()
            jest.setSystemTime(now + 5 * 60 * 60 * 1000)

            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: 'new-token',
                    expires_in: 3600,
                }),
            })

            await getTwitchUserAccessToken()

            const call = fetchMock.mock.calls[0]
            const bodyStr = call[1].body.toString()

            expect(bodyStr).toContain('refresh_token=refresh-xyz')
            expect(bodyStr).toContain('grant_type=refresh_token')

            jest.useRealTimers()
        })

        test('handles refresh token network error', async () => {
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = 'old-token'
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'

            fetchMock.mockRejectedValueOnce(new Error('Network error'))

            jest.useFakeTimers()
            const now = Date.now()
            jest.setSystemTime(now + 5 * 60 * 60 * 1000)

            const result = await getTwitchUserAccessToken()

            expect(result).toBe('old-token')

            jest.useRealTimers()
        })

        test('returns env token with default expiry when no refresh', async () => {
            const token = 'env-token'
            process.env.TWITCH_CLIENT_ID = 'client-123'
            process.env.TWITCH_CLIENT_SECRET = 'secret-456'
            process.env.TWITCH_ACCESS_TOKEN = token

            const result = await getTwitchUserAccessToken()

            expect(result).toBe(token)
        })
    })

    describe('clearTwitchTokenCache', () => {
        test('exports clearTwitchTokenCache function', () => {
            expect(typeof clearTwitchTokenCache).toBe('function')
        })

        test('can be called without error', () => {
            expect(() => clearTwitchTokenCache()).not.toThrow()
        })
    })
})
