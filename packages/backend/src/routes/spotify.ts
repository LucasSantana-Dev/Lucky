import type { Express, Request, Response } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { spotifyLinkService } from '@lucky/shared/services'
import {
    exchangeCodeForToken,
    isSpotifyAuthConfigured,
} from '../services/SpotifyAuthService'
import {
    optionalAuth,
    requireAuth,
    type AuthenticatedRequest,
} from '../middleware/auth'
import { apiLimiter } from '../middleware/rateLimit'
import { getPrimaryFrontendUrl } from '../utils/frontendOrigin'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'

const SPOTIFY_STATE_COOKIE = 'spotify_state'
const STATE_MAX_AGE_SEC = 600

const spotifyCallbackQuery = z.object({
    code: z.string().min(1),
    state: z.string().min(1).optional(),
})

function getLinkSecret(): string {
    const secret =
        process.env.SPOTIFY_LINK_SECRET || process.env.WEBAPP_SESSION_SECRET
    if (!secret)
        throw new Error(
            'SPOTIFY_LINK_SECRET or WEBAPP_SESSION_SECRET required for Spotify link',
        )
    return secret
}

function encodeState(discordId: string, secret: string): string {
    const payload = Buffer.from(discordId, 'utf8').toString('base64url')
    const sig = crypto
        .createHmac('sha256', secret)
        .update(discordId, 'utf8')
        .digest('hex')
    return `${payload}.${sig}`
}

function decodeAndVerifyState(state: string, secret: string): string | null {
    const parts = state.split('.')
    if (parts.length !== 2) return null
    const [payloadB64, sig] = parts
    let discordId: string
    try {
        discordId = Buffer.from(payloadB64, 'base64url').toString('utf8')
    } catch {
        return null
    }
    const expected = crypto
        .createHmac('sha256', secret)
        .update(discordId, 'utf8')
        .digest('hex')
    const sigBuf = Buffer.from(sig, 'utf8')
    const expectedBuf = Buffer.from(expected, 'utf8')
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return discordId
    }
    return null
}

function getFrontendUrl(): string {
    return getPrimaryFrontendUrl()
}

function parseAbsoluteOrigin(url: string): string | null {
    try {
        return new URL(url).origin
    } catch {
        return null
    }
}

function resolveBackendBaseUrl(req: Request): string {
    const fromEnv = process.env.WEBAPP_BACKEND_URL?.trim()
    const envOrigin = fromEnv ? parseAbsoluteOrigin(fromEnv) : null
    if (envOrigin) {
        return envOrigin
    }
    return new URL(getOAuthRedirectUri(req)).origin
}

export function setupSpotifyRoutes(app: Express): void {
    app.get(
        '/api/spotify/status',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordId = req.user?.id
                if (!discordId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const link = await spotifyLinkService.getByDiscordId(discordId)
                const configured = isSpotifyAuthConfigured()
                res.json({
                    configured,
                    linked: !!link,
                    username: link?.spotifyUsername ?? null,
                })
            } catch (error) {
                errorLog({ message: 'Spotify status error', error })
                res.status(500).json({ error: 'Failed to check status' })
            }
        },
    )

    app.delete(
        '/api/spotify/unlink',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordId = req.user?.id
                if (!discordId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const ok = await spotifyLinkService.unlink(discordId)
                if (!ok) {
                    res.status(404).json({ error: 'No Spotify link found' })
                    return
                }
                debugLog({
                    message: 'Spotify unlinked via API',
                    data: { discordId },
                })
                res.json({ success: true })
            } catch (error) {
                errorLog({ message: 'Spotify unlink error', error })
                res.status(500).json({ error: 'Failed to unlink' })
            }
        },
    )

    app.get(
        '/api/spotify/connect',
        optionalAuth,
        (req: AuthenticatedRequest, res: Response) => {
            try {
                if (!isSpotifyAuthConfigured()) {
                    const frontendUrl = getFrontendUrl()
                    return res.redirect(
                        `${frontendUrl}/?error=spotify_not_configured`,
                    )
                }
                const secret = getLinkSecret()
                const stateFromQuery = req.query.state
                const providedState =
                    typeof stateFromQuery === 'string' ? stateFromQuery : null
                const discordIdFromState = providedState
                    ? decodeAndVerifyState(providedState, secret)
                    : null
                const discordId = discordIdFromState ?? req.user?.id

                if (!discordId) {
                    const frontendUrl = getFrontendUrl()
                    return res.redirect(
                        `${frontendUrl}/?error=spotify_invalid_state`,
                    )
                }
                const state = providedState ?? encodeState(discordId, secret)

                res.cookie(SPOTIFY_STATE_COOKIE, state, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: STATE_MAX_AGE_SEC * 1000,
                    path: '/',
                })
                const clientId = process.env.SPOTIFY_CLIENT_ID
                if (!clientId) {
                    const frontendUrl = getFrontendUrl()
                    return res.redirect(
                        `${frontendUrl}/?error=spotify_not_configured`,
                    )
                }
                const backendBaseUrl = resolveBackendBaseUrl(req)
                const callbackUrl = `${backendBaseUrl}/api/spotify/callback?state=${encodeURIComponent(state)}`
                const scopes = ['user-top-read', 'user-read-recently-played', 'user-library-read']
                const authUrl = `https://accounts.spotify.com/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scopes.join(' '))}`
                res.redirect(authUrl)
            } catch (error) {
                errorLog({ message: 'Spotify connect error', error })
                const frontendUrl = getFrontendUrl()
                res.redirect(`${frontendUrl}/?error=spotify_connect_error`)
            }
        },
    )

    app.get('/api/spotify/callback', apiLimiter, async (req: Request, res: Response) => {
        const frontendUrl = getFrontendUrl()
        try {
            const cookies = req.cookies as Record<string, unknown> | undefined
            const stateFromCookie = cookies?.[SPOTIFY_STATE_COOKIE]
            const parsedQuery = spotifyCallbackQuery.safeParse(req.query)
            res.clearCookie(SPOTIFY_STATE_COOKIE, { path: '/' })

            if (!parsedQuery.success) {
                return res.redirect(
                    `${frontendUrl}/?error=spotify_missing_code`,
                )
            }

            const state =
                typeof parsedQuery.data.state === 'string'
                    ? parsedQuery.data.state
                    : typeof stateFromCookie === 'string'
                      ? stateFromCookie
                      : null

            if (!state) {
                return res.redirect(
                    `${frontendUrl}/?error=spotify_missing_state`,
                )
            }
            const secret = getLinkSecret()
            const discordId = decodeAndVerifyState(state, secret)
            if (!discordId) {
                return res.redirect(
                    `${frontendUrl}/?error=spotify_invalid_state`,
                )
            }
            const token = await exchangeCodeForToken(parsedQuery.data.code)
            if (!token) {
                return res.redirect(
                    `${frontendUrl}/?error=spotify_exchange_failed`,
                )
            }
            const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000)
            const ok = await spotifyLinkService.set({
                discordId,
                spotifyId: token.spotifyId,
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                tokenExpiresAt,
                spotifyUsername: token.spotifyUsername,
            })
            if (!ok) {
                return res.redirect(`${frontendUrl}/?error=spotify_save_failed`)
            }
            debugLog({
                message: 'Spotify linked',
                data: { discordId, username: token.spotifyUsername },
            })
            res.redirect(`${frontendUrl}/?spotify_linked=true`)
        } catch (error) {
            errorLog({ message: 'Spotify callback error', error })
            res.redirect(`${frontendUrl}/?error=spotify_callback_error`)
        }
    })
}
