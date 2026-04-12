import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { isSpotifyConfigured } from './spotifyConfig'

describe('spotifyConfig', () => {
    const originalEnv = process.env

    beforeEach(() => {
        jest.resetModules()
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('returns true when all required env vars are set', () => {
        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
        process.env.SPOTIFY_REDIRECT_URI = 'https://example.com/callback'

        expect(isSpotifyConfigured()).toBe(true)
    })

    it('returns false when SPOTIFY_CLIENT_ID is missing', () => {
        process.env.SPOTIFY_CLIENT_ID = undefined
        process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
        process.env.SPOTIFY_REDIRECT_URI = 'https://example.com/callback'

        expect(isSpotifyConfigured()).toBe(false)
    })

    it('returns false when SPOTIFY_CLIENT_SECRET is missing', () => {
        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = undefined
        process.env.SPOTIFY_REDIRECT_URI = 'https://example.com/callback'

        expect(isSpotifyConfigured()).toBe(false)
    })

    it('returns false when SPOTIFY_REDIRECT_URI is missing', () => {
        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
        process.env.SPOTIFY_REDIRECT_URI = undefined

        expect(isSpotifyConfigured()).toBe(false)
    })

    it('returns false when all env vars are missing', () => {
        process.env.SPOTIFY_CLIENT_ID = undefined
        process.env.SPOTIFY_CLIENT_SECRET = undefined
        process.env.SPOTIFY_REDIRECT_URI = undefined

        expect(isSpotifyConfigured()).toBe(false)
    })

    it('returns false when empty strings are provided', () => {
        process.env.SPOTIFY_CLIENT_ID = ''
        process.env.SPOTIFY_CLIENT_SECRET = ''
        process.env.SPOTIFY_REDIRECT_URI = ''

        expect(isSpotifyConfigured()).toBe(false)
    })
})
