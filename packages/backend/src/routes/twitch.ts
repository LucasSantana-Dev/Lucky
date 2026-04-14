import type { Express, Request, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { twitchNotificationService } from '@lucky/shared/services'
import { AppError } from '../errors/AppError'
import { z } from 'zod'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const addTwitchBody = z
    .object({
        twitchUserId: z.string().min(1).max(50),
        twitchLogin: z.string().min(1).max(50),
        discordChannelId: z.string().regex(/^\d{17,20}$/),
    })
    .strict()

const removeTwitchBody = z
    .object({
        twitchUserId: z.string().min(1).max(50),
    })
    .strict()

type TwitchUser = { id: string; login: string; display_name: string }

let appTokenCache: { token: string; expiresAt: number } | null = null

async function getAppAccessToken(
    clientId: string,
    clientSecret: string,
): Promise<string | null> {
    if (appTokenCache && appTokenCache.expiresAt > Date.now() + 60_000) {
        return appTokenCache.token
    }
    try {
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        })
        const res = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        })
        if (!res.ok) return null
        const data = (await res.json()) as {
            access_token: string
            expires_in: number
        }
        appTokenCache = {
            token: data.access_token,
            expiresAt: Date.now() + data.expires_in * 1000,
        }
        return data.access_token
    } catch {
        return null
    }
}

async function fetchTwitchUser(
    login: string,
    token: string,
    clientId: string,
): Promise<{ user: TwitchUser | null; status: number }> {
    const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Client-Id': clientId },
    })
    if (!res.ok) return { user: null, status: res.status }
    const json = (await res.json()) as { data: TwitchUser[] }
    return { user: json.data?.[0] ?? null, status: res.status }
}

async function lookupTwitchUser(
    login: string,
): Promise<{ user: TwitchUser | null; configured: boolean }> {
    const clientId = process.env.TWITCH_CLIENT_ID
    const clientSecret = process.env.TWITCH_CLIENT_SECRET
    if (!clientId) return { user: null, configured: false }

    let token = process.env.TWITCH_ACCESS_TOKEN ?? null

    if (!token) {
        if (!clientSecret) return { user: null, configured: false }
        token = await getAppAccessToken(clientId, clientSecret)
        if (!token) return { user: null, configured: false }
    }

    const first = await fetchTwitchUser(login, token, clientId)
    if (first.status !== 401) {
        return { user: first.user, configured: true }
    }

    // Token expired — refresh app token once and retry
    appTokenCache = null
    if (!clientSecret) return { user: null, configured: true }
    const refreshed = await getAppAccessToken(clientId, clientSecret)
    if (!refreshed) return { user: null, configured: true }
    const retry = await fetchTwitchUser(login, refreshed, clientId)
    return { user: retry.user, configured: true }
}

export function setupTwitchRoutes(app: Express): void {
    app.get(
        '/api/twitch/status',
        asyncHandler(async (_req: Request, res: Response) => {
            const configured = !!process.env.TWITCH_CLIENT_ID
            res.json({ configured })
        }),
    )

    app.get(
        '/api/twitch/users',
        requireAuth,
        asyncHandler(async (req: Request, res: Response) => {
            const login = req.query.login
            if (typeof login !== 'string' || login.length < 1) {
                throw AppError.badRequest('login query parameter required')
            }
            const { user, configured } = await lookupTwitchUser(
                login.toLowerCase(),
            )
            if (!configured) {
                throw AppError.serviceUnavailable(
                    'Twitch is not configured on this server',
                )
            }
            if (!user) {
                throw AppError.notFound('Twitch user not found')
            }
            res.json({
                id: user.id,
                login: user.login,
                displayName: user.display_name,
            })
        }),
    )

    app.get(
        '/api/guilds/:guildId/twitch/notifications',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const notifications =
                await twitchNotificationService.listByGuild(guildId)
            res.json({ notifications })
        }),
    )

    app.post(
        '/api/guilds/:guildId/twitch/notifications',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(addTwitchBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const body = addTwitchBody.parse(req.body)
            const { twitchUserId, twitchLogin, discordChannelId } = body
            const success = await twitchNotificationService.add(
                guildId,
                discordChannelId,
                twitchUserId,
                twitchLogin,
            )
            res.json({ success })
        }),
    )

    app.delete(
        '/api/guilds/:guildId/twitch/notifications',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(removeTwitchBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { twitchUserId } = removeTwitchBody.parse(req.body)
            const success = await twitchNotificationService.remove(
                guildId,
                twitchUserId,
            )
            res.json({ success })
        }),
    )
}
