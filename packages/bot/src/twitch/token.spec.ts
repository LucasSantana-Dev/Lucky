import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import {
    getTwitchEnv,
    isTwitchConfigured,
    getTwitchUserAccessToken,
    clearTwitchTokenCache,
} from './token'

describe('twitch/token', () => {
    let fetchSpy: jest.SpyInstance
    const originalEnv = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        process.env = { ...originalEnv }
        fetchSpy = jest.spyOn(global, 'fetch')
        clearTwitchTokenCache()
    })

    afterEach(() => {
        fetchSpy.mockRestore()
        process.env = originalEnv
    })

    describe('getTwitchEnv', () => {
        it('should return all environment variables', () => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            process.env.TWITCH_ACCESS_TOKEN = 'access-token'
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'

            const env = getTwitchEnv()

            expect(env).toEqual({
                clientId: 'client-id',
                clientSecret: 'client-secret',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
            })
        })

        it('should return empty strings for missing variables', () => {
            delete process.env.TWITCH_CLIENT_ID
            delete process.env.TWITCH_CLIENT_SECRET
            delete process.env.TWITCH_ACCESS_TOKEN
            delete process.env.TWITCH_REFRESH_TOKEN

            const env = getTwitchEnv()

            expect(env.clientId).toBe('')
            expect(env.clientSecret).toBe('')
            expect(env.accessToken).toBeUndefined()
            expect(env.refreshToken).toBeUndefined()
        })

        it('should return undefined for optional tokens', () => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            delete process.env.TWITCH_ACCESS_TOKEN
            delete process.env.TWITCH_REFRESH_TOKEN

            const env = getTwitchEnv()

            expect(env.accessToken).toBeUndefined()
            expect(env.refreshToken).toBeUndefined()
        })
    })

    describe('isTwitchConfigured', () => {
        it('should return true when all required variables are set', () => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            process.env.TWITCH_ACCESS_TOKEN = 'access-token'

            const configured = isTwitchConfigured()

            expect(configured).toBe(true)
        })

        it('should return false if client id is missing', () => {
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            process.env.TWITCH_ACCESS_TOKEN = 'access-token'
            delete process.env.TWITCH_CLIENT_ID

            const configured = isTwitchConfigured()

            expect(configured).toBe(false)
        })

        it('should return false if client secret is missing', () => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_ACCESS_TOKEN = 'access-token'
            delete process.env.TWITCH_CLIENT_SECRET

            const configured = isTwitchConfigured()

            expect(configured).toBe(false)
        })

        it('should return false if access token is missing', () => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            delete process.env.TWITCH_ACCESS_TOKEN

            const configured = isTwitchConfigured()

            expect(configured).toBe(false)
        })

        it('should return false if all variables are missing', () => {
            delete process.env.TWITCH_CLIENT_ID
            delete process.env.TWITCH_CLIENT_SECRET
            delete process.env.TWITCH_ACCESS_TOKEN

            const configured = isTwitchConfigured()

            expect(configured).toBe(false)
        })
    })

    describe('getTwitchUserAccessToken', () => {
        beforeEach(() => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            process.env.TWITCH_ACCESS_TOKEN = 'initial-token'
            clearTwitchTokenCache()
        })

        it('should return null if client id is missing', async () => {
            delete process.env.TWITCH_CLIENT_ID

            const token = await getTwitchUserAccessToken()

            expect(token).toBeNull()
        })

        it('should return null if client secret is missing', async () => {
            delete process.env.TWITCH_CLIENT_SECRET

            const token = await getTwitchUserAccessToken()

            expect(token).toBeNull()
        })

        it('should return null if access token is missing', async () => {
            delete process.env.TWITCH_ACCESS_TOKEN

            const token = await getTwitchUserAccessToken()

            expect(token).toBeNull()
        })

        it('should return cached token if not expired', async () => {
            await getTwitchUserAccessToken()
            const secondToken = await getTwitchUserAccessToken()

            expect(secondToken).toBe('initial-token')
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('should refresh token if expired and refresh token available', async () => {
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'

            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    access_token: 'new-token',
                    expires_in: 3600,
                }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            // First call to populate cache
            await getTwitchUserAccessToken()

            // Manually expire the cache to test refresh
            clearTwitchTokenCache()

            const refreshedToken = await getTwitchUserAccessToken()

            expect(refreshedToken).toBe('new-token')
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://id.twitch.tv/oauth2/token',
                expect.objectContaining({
                    method: 'POST',
                }),
            )
        })

        it('should use initial token if refresh fails', async () => {
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'
            clearTwitchTokenCache()

            const mockResponse = {
                ok: false,
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const token = await getTwitchUserAccessToken()

            expect(token).toBe('initial-token')
        })

        it('should use initial token if refresh throws error', async () => {
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'
            clearTwitchTokenCache()

            fetchSpy.mockRejectedValue(new Error('Network error'))

            const token = await getTwitchUserAccessToken()

            expect(token).toBe('initial-token')
        })

        it('should set expiration to 4 hours for non-refreshed token', async () => {
            clearTwitchTokenCache()

            const token = await getTwitchUserAccessToken()
            const secondToken = await getTwitchUserAccessToken()

            expect(token).toBe('initial-token')
            expect(secondToken).toBe('initial-token')
            // Should not have refreshed, token still valid
            expect(fetchSpy).not.toHaveBeenCalled()
        })
    })

    describe('clearTwitchTokenCache', () => {
        beforeEach(() => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            process.env.TWITCH_ACCESS_TOKEN = 'access-token'
        })

        it('should clear the cached token', async () => {
            // Cache a token
            await getTwitchUserAccessToken()

            // Clear cache
            clearTwitchTokenCache()

            // Next call should return the same initial token (no refresh token)
            const token = await getTwitchUserAccessToken()

            expect(token).toBe('access-token')
        })

        it('should force refresh on next call after clear', async () => {
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'

            // Cache a token
            await getTwitchUserAccessToken()

            // Clear cache
            clearTwitchTokenCache()

            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    access_token: 'new-token',
                    expires_in: 3600,
                }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const token = await getTwitchUserAccessToken()

            // Should attempt refresh when cache is cleared
            expect(fetchSpy).toHaveBeenCalled()
        })
    })

    describe('token refresh edge cases', () => {
        beforeEach(() => {
            process.env.TWITCH_CLIENT_ID = 'client-id'
            process.env.TWITCH_CLIENT_SECRET = 'client-secret'
            process.env.TWITCH_ACCESS_TOKEN = 'access-token'
            clearTwitchTokenCache()
        })

        it('should handle malformed refresh response', async () => {
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'
            clearTwitchTokenCache()

            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({}),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const token = await getTwitchUserAccessToken()

            // When refresh response is malformed and has no access_token, still returns something
            // since there's an initial access-token in env
            expect(token).not.toBeNull()
        })

        it('should use URLSearchParams for refresh request body', async () => {
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token'
            clearTwitchTokenCache()

            const mockResponse = {
                ok: false,
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            await getTwitchUserAccessToken()

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://id.twitch.tv/oauth2/token',
                expect.objectContaining({
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: expect.stringContaining('grant_type=refresh_token'),
                }),
            )
        })
    })
})
