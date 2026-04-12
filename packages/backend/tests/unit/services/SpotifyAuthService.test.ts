import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { exchangeCodeForToken, isSpotifyAuthConfigured } from '../../../src/services/SpotifyAuthService'

const originalEnv = process.env

beforeEach(() => {
    process.env = {
        ...originalEnv,
        SPOTIFY_CLIENT_ID: 'test-client-id',
        SPOTIFY_CLIENT_SECRET: 'test-client-secret',
        SPOTIFY_REDIRECT_URI: 'https://example.com/callback',
    }
    jest.resetAllMocks()
})

afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
})

describe('isSpotifyAuthConfigured', () => {
    test('returns true when all env vars are set', () => {
        expect(isSpotifyAuthConfigured()).toBe(true)
    })

    test('returns false when SPOTIFY_CLIENT_ID is missing', () => {
        delete process.env.SPOTIFY_CLIENT_ID
        expect(isSpotifyAuthConfigured()).toBe(false)
    })

    test('returns false when SPOTIFY_CLIENT_SECRET is missing', () => {
        delete process.env.SPOTIFY_CLIENT_SECRET
        expect(isSpotifyAuthConfigured()).toBe(false)
    })

    test('returns false when SPOTIFY_REDIRECT_URI is missing', () => {
        delete process.env.SPOTIFY_REDIRECT_URI
        expect(isSpotifyAuthConfigured()).toBe(false)
    })
})

describe('exchangeCodeForToken', () => {
    test('returns null when env vars are missing', async () => {
        delete process.env.SPOTIFY_CLIENT_ID
        const result = await exchangeCodeForToken('any-code')
        expect(result).toBeNull()
    })

    test('returns null when token exchange request fails', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: false,
            status: 400,
        } as Response)

        const result = await exchangeCodeForToken('bad-code')
        expect(result).toBeNull()
    })

    test('returns null when token response has error field', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ error: 'invalid_grant' }),
        } as Response)

        const result = await exchangeCodeForToken('bad-code')
        expect(result).toBeNull()
    })

    test('returns null when token response missing access_token', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ refresh_token: 'rt' }),
        } as Response)

        const result = await exchangeCodeForToken('code')
        expect(result).toBeNull()
    })

    test('returns null when user profile request fails', async () => {
        jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
            } as Response)
            .mockResolvedValueOnce({ ok: false, status: 401 } as Response)

        const result = await exchangeCodeForToken('code')
        expect(result).toBeNull()
    })

    test('returns token data on success', async () => {
        jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ id: 'spotify-user-1', display_name: 'Test User' }),
            } as Response)

        const result = await exchangeCodeForToken('valid-code')
        expect(result).not.toBeNull()
        expect(result?.accessToken).toBe('at')
        expect(result?.refreshToken).toBe('rt')
        expect(result?.spotifyId).toBe('spotify-user-1')
        expect(result?.spotifyUsername).toBe('Test User')
    })

    test('returns null when fetch throws', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network'))
        const result = await exchangeCodeForToken('code')
        expect(result).toBeNull()
    })
})
