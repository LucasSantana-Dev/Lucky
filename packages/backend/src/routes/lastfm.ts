import type { Express, Request, Response } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { lastFmLinkService } from '@lucky/shared/services'
import {
    exchangeTokenForSession,
    isLastFmAuthConfigured,
} from '../services/LastFmAuthService'
import {
    optionalAuth,
    requireAuth,
    type AuthenticatedRequest,
} from '../middleware/auth'
import { getPrimaryFrontendUrl } from '../utils/frontendOrigin'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'

const LASTFM_STATE_COOKIE = 'lastfm_state'
const STATE_MAX_AGE_SEC = 600
const lastFmCallbackQuery = z.object({ token: z.string().min(1), state: z.string().min(1).optional() })

function getLinkSecret(): string {
    const secret =
        process.env.LASTFM_LINK_SECRET || process.env.WEBAPP_SESSION_SECRET
    if (!secret)
        throw new Error(
            'LASTFM_LINK_SECRET or WEBAPP_SESSION_SECRET required for Last.fm link',
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
    if (
        crypto.timingSafeEqual(
            Buffer.from(sig, 'utf8'),
            Buffer.from(expected, 'utf8'),
        )
    ) {
        return discordId
    }
    return null
}

function getFrontendUrl(): string {
    return getPrimaryFrontendUrl()
}

function resolveBackendBaseUrl(req: Request): string {
    const base = process.env.WEBAPP_BACKEND_URL?.trim() ?? new URL(getOAuthRedirectUri(req)).origin
    return base.endsWith('/') ? base.slice(0, -1) : base
}

export function setupLastFmRoutes(app: Express): void {
    app.get(
        '/api/lastfm/status',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordId = req.user?.id
                if (!discordId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const link = await lastFmLinkService.getByDiscordId(discordId)
                const configured = isLastFmAuthConfigured()
                res.json({
                    configured,
                    linked: !!link,
                    username: link?.lastFmUsername ?? null,
                })
            } catch (error) {
                errorLog({ message: 'Last.fm status error', error })
                res.status(500).json({ error: 'Failed to check status' })
            }
        },
    )

    app.delete(
        '/api/lastfm/unlink',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const discordId = req.user?.id
                if (!discordId) {
                    res.status(401).json({ error: 'Not authenticated' })
                    return
                }
                const ok = await lastFmLinkService.unlink(discordId)
                if (!ok) {
                    res.status(404).json({ error: 'No Last.fm link found' })
                    return
                }
                debugLog({
                    message: 'Last.fm unlinked via API',
                    data: { discordId },
                })
                res.json({ success: true })
            } catch (error) {
                errorLog({ message: 'Last.fm unlink error', error })
                res.status(500).json({ error: 'Failed to unlink' })
            }
        },
    )

    app.get(
        '/api/lastfm/connect',
        optionalAuth,
        (req: AuthenticatedRequest, res: Response) => {
            try {
                if (!isLastFmAuthConfigured()) {
                    const frontendUrl = getFrontendUrl()
                    return res.redirect(
                        `${frontendUrl}/?error=lastfm_not_configured`,
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
                        `${frontendUrl}/?error=lastfm_invalid_state`,
                    )
                }
                const state = providedState ?? encodeState(discordId, secret)

                res.cookie(LASTFM_STATE_COOKIE, state, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: STATE_MAX_AGE_SEC * 1000,
                    path: '/',
                })
                const apiKey = process.env.LASTFM_API_KEY
                if (!apiKey) {
                    const frontendUrl = getFrontendUrl()
                    return res.redirect(
                        `${frontendUrl}/?error=lastfm_not_configured`,
                    )
                }
                const backendBaseUrl = resolveBackendBaseUrl(req)
                const callbackUrl = `${backendBaseUrl}/api/lastfm/callback?state=${encodeURIComponent(state)}`
                const authUrl = `https://www.last.fm/api/auth?api_key=${encodeURIComponent(apiKey)}&cb=${encodeURIComponent(callbackUrl)}`
                res.redirect(authUrl)
            } catch (error) {
                errorLog({ message: 'Last.fm connect error', error })
                const frontendUrl = getFrontendUrl()
                res.redirect(`${frontendUrl}/?error=lastfm_connect_error`)
            }
        },
    )

    app.get('/api/lastfm/callback', async (req: Request, res: Response) => {
        const frontendUrl = getFrontendUrl()
        try {
            const cookies = req.cookies as Record<string, unknown> | undefined
            const stateFromCookie = cookies?.[LASTFM_STATE_COOKIE]
            const parsedQuery = lastFmCallbackQuery.safeParse(req.query)
            res.clearCookie(LASTFM_STATE_COOKIE, { path: '/' })

            if (!parsedQuery.success) {
                return res.redirect(
                    `${frontendUrl}/?error=lastfm_missing_token`,
                )
            }

            const state =
                typeof parsedQuery.data.state === 'string'
                    ? parsedQuery.data.state
                    : (typeof stateFromCookie === 'string' ? stateFromCookie : null)

            if (!state) {
                return res.redirect(
                    `${frontendUrl}/?error=lastfm_missing_state`,
                )
            }
            const secret = getLinkSecret()
            const discordId = decodeAndVerifyState(state, secret)
            if (!discordId) {
                return res.redirect(
                    `${frontendUrl}/?error=lastfm_invalid_state`,
                )
            }
            const session = await exchangeTokenForSession(
                parsedQuery.data.token,
            )
            if (!session) {
                return res.redirect(
                    `${frontendUrl}/?error=lastfm_exchange_failed`,
                )
            }
            const ok = await lastFmLinkService.set(
                discordId,
                session.sessionKey,
                session.username,
            )
            if (!ok) {
                return res.redirect(`${frontendUrl}/?error=lastfm_save_failed`)
            }
            debugLog({
                message: 'Last.fm linked',
                data: { discordId, username: session.username },
            })
            res.redirect(`${frontendUrl}/?lastfm_linked=true`)
        } catch (error) {
            errorLog({ message: 'Last.fm callback error', error })
            res.redirect(`${frontendUrl}/?error=lastfm_callback_error`)
        }
    })
}
