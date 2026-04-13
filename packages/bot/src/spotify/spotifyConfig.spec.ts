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

    it('returns true when client id and secret are set', () => {
        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'

        expect(isSpotifyConfigured()).toBe(true)
    })

    it('returns true when redirect uri is also set', () => {
        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
        process.env.SPOTIFY_REDIRECT_URI = 'https://example.com/callback'

        expect(isSpotifyConfigured()).toBe(true)
    })

    it('returns false when SPOTIFY_CLIENT_ID is missing', () => {
        process.env.SPOTIFY_CLIENT_ID = undefined
        process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'

        expect(isSpotifyConfigured()).toBe(false)
    })

    it('returns false when SPOTIFY_CLIENT_SECRET is missing', () => {
        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = undefined

        expect(isSpotifyConfigured()).toBe(false)
    })

    it('returns true when SPOTIFY_REDIRECT_URI is missing (optional)', () => {
        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
        process.env.SPOTIFY_REDIRECT_URI = undefined

        expect(isSpotifyConfigured()).toBe(true)
    })

    it('returns false when all env vars are missing', () => {
        process.env.SPOTIFY_CLIENT_ID = undefined
        process.env.SPOTIFY_CLIENT_SECRET = undefined

        expect(isSpotifyConfigured()).toBe(false)
    })

    it('returns false when empty strings are provided', () => {
        process.env.SPOTIFY_CLIENT_ID = ''
        process.env.SPOTIFY_CLIENT_SECRET = ''

        expect(isSpotifyConfigured()).toBe(false)
    })
})
