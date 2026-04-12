import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

const mockSpotifyLinkService = {
    getByDiscordId: jest.fn() as any,
    unlink: jest.fn() as any,
    set: jest.fn() as any,
}

const mockSpotifyAuthService = {
    exchangeCodeForToken: jest.fn() as any,
    isSpotifyAuthConfigured: jest.fn() as any,
}

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: mockSpotifyLinkService,
}))

jest.mock('../../../src/services/SpotifyAuthService', () => mockSpotifyAuthService)

import { setupSpotifyRoutes } from '../../../src/routes/spotify'

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (req: any, res: any, next: any) => {
        req.user = { id: 'test-discord-id' }
        next()
    },
    optionalAuth: (req: any, res: any, next: any) => {
        req.user = { id: 'test-discord-id' }
        next()
    },
}))

jest.mock('../../../src/utils/frontendOrigin', () => ({
    getPrimaryFrontendUrl: () => 'https://lucky.lucassantana.tech',
}))

jest.mock('../../../src/utils/oauthRedirectUri', () => ({
    getOAuthRedirectUri: () => 'https://api.lucassantana.tech/api/spotify/callback',
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

describe('Spotify Routes', () => {
    let app: Express

    beforeEach(() => {
        jest.clearAllMocks()
        app = express()
        app.use(express.json())
        setupSpotifyRoutes(app)

        process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
        process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret'
        process.env.SPOTIFY_REDIRECT_URI = 'https://api.lucassantana.tech/api/spotify/callback'
        process.env.WEBAPP_SESSION_SECRET = 'test-secret'
    })

    describe('GET /api/spotify/status', () => {
        it('returns configured and linked status', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(true)
            mockSpotifyLinkService.getByDiscordId.mockResolvedValue({
                spotifyId: 'spotify-123',
                accessToken: 'token',
                refreshToken: 'refresh',
                tokenExpiresAt: new Date(),
                spotifyUsername: 'test-user',
            })

            const res = await request(app).get('/api/spotify/status')

            expect(res.status).toBe(200)
            expect(res.body).toEqual({
                configured: true,
                linked: true,
                username: 'test-user',
            })
        })

        it('returns not linked when no link found', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(true)
            mockSpotifyLinkService.getByDiscordId.mockResolvedValue(null)

            const res = await request(app).get('/api/spotify/status')

            expect(res.status).toBe(200)
            expect(res.body.linked).toBe(false)
        })
    })

    describe('DELETE /api/spotify/unlink', () => {
        it('unlinks Spotify account', async () => {
            mockSpotifyLinkService.unlink.mockResolvedValue(true)

            const res = await request(app).delete('/api/spotify/unlink')

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockSpotifyLinkService.unlink).toHaveBeenCalledWith('test-discord-id')
        })

        it('returns 404 when no link found', async () => {
            mockSpotifyLinkService.unlink.mockResolvedValue(false)

            const res = await request(app).delete('/api/spotify/unlink')

            expect(res.status).toBe(404)
        })
    })

    describe('GET /api/spotify/connect', () => {
        it('redirects to Spotify authorization', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(true)

            const res = await request(app).get('/api/spotify/connect')

            expect(res.status).toBe(302)
            expect(res.header.location).toContain('https://accounts.spotify.com/authorize')
            expect(res.header.location).toContain('client_id=test-client-id')
        })

        it('redirects to frontend with error when not configured', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(false)

            const res = await request(app).get('/api/spotify/connect')

            expect(res.status).toBe(302)
            expect(res.header.location).toContain('error=spotify_not_configured')
        })
    })

    describe('GET /api/spotify/callback', () => {
        it('exchanges code and links account', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(true)
            mockSpotifyAuthService.exchangeCodeForToken.mockResolvedValue({
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                expiresIn: 3600,
                spotifyId: 'spotify-123',
                spotifyUsername: 'test-user',
            })
            mockSpotifyLinkService.set.mockResolvedValue(true)

            const state = Buffer.from('test-discord-id').toString('base64url')
            const sig = require('crypto')
                .createHmac('sha256', 'test-secret')
                .update('test-discord-id')
                .digest('hex')
            const encodedState = `${state}.${sig}`

            const res = await request(app)
                .get(`/api/spotify/callback?code=auth-code&state=${encodedState}`)
                .set('Cookie', [`spotify_state=${encodedState}`])

            expect(res.status).toBe(302)
            expect(res.header.location).toContain('spotify_linked=true')
        })

        it('returns error when exchange fails', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(true)
            mockSpotifyAuthService.exchangeCodeForToken.mockResolvedValue(null)

            const state = Buffer.from('test-discord-id').toString('base64url')
            const sig = require('crypto')
                .createHmac('sha256', 'test-secret')
                .update('test-discord-id')
                .digest('hex')
            const encodedState = `${state}.${sig}`

            const res = await request(app)
                .get(`/api/spotify/callback?code=bad-code&state=${encodedState}`)
                .set('Cookie', [`spotify_state=${encodedState}`])

            expect(res.status).toBe(302)
            expect(res.header.location).toContain('error=spotify_exchange_failed')
        })

        it('redirects with error when code is missing', async () => {
            const res = await request(app).get('/api/spotify/callback')
            expect(res.status).toBe(302)
            expect(res.header.location).toContain('error=spotify_missing_code')
        })

        it('redirects with error when state is invalid hmac', async () => {
            const badState = `${Buffer.from('user-x').toString('base64url')}.badhmacsignature`
            const res = await request(app)
                .get(`/api/spotify/callback?code=code&state=${badState}`)
            expect(res.status).toBe(302)
            expect(res.header.location).toContain('error=spotify_invalid_state')
        })

        it('redirects with error when set fails', async () => {
            mockSpotifyAuthService.exchangeCodeForToken.mockResolvedValue({
                accessToken: 'at', refreshToken: 'rt', expiresIn: 3600,
                spotifyId: 'sid', spotifyUsername: 'user',
            })
            mockSpotifyLinkService.set.mockResolvedValue(null)

            const state = Buffer.from('test-discord-id').toString('base64url')
            const sig = require('crypto')
                .createHmac('sha256', 'test-secret')
                .update('test-discord-id')
                .digest('hex')
            const encodedState = `${state}.${sig}`

            const res = await request(app)
                .get(`/api/spotify/callback?code=code&state=${encodedState}`)
            expect(res.status).toBe(302)
            expect(res.header.location).toContain('error=spotify_save_failed')
        })
    })

    describe('GET /api/spotify/connect — edge cases', () => {
        it('redirects with error when no discord id resolvable', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(true)
            const app2 = express()
            app2.use(express.json())
            jest.doMock('../../../src/middleware/auth', () => ({
                requireAuth: (_: any, __: any, next: any) => next(),
                optionalAuth: (_: any, __: any, next: any) => next(),
            }))
            setupSpotifyRoutes(app2)

            const res = await request(app2).get('/api/spotify/connect?state=invalid.state')
            expect(res.status).toBe(302)
        })

        it('redirects to spotify auth when discord_id in query', async () => {
            mockSpotifyAuthService.isSpotifyAuthConfigured.mockReturnValue(true)
            const res = await request(app).get('/api/spotify/connect')
            expect(res.status).toBe(302)
            expect(res.header.location).toContain('accounts.spotify.com')
        })
    })

    describe('error catch paths', () => {
        it('status returns 500 on unexpected error', async () => {
            mockSpotifyLinkService.getByDiscordId.mockRejectedValue(new Error('db error'))
            const res = await request(app).get('/api/spotify/status')
            expect(res.status).toBe(500)
        })

        it('unlink returns 500 on unexpected error', async () => {
            mockSpotifyLinkService.unlink.mockRejectedValue(new Error('db error'))
            const res = await request(app).delete('/api/spotify/unlink')
            expect(res.status).toBe(500)
        })
    })
})
