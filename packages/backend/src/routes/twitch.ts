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

async function lookupTwitchUser(login: string) {
    const token = process.env.TWITCH_ACCESS_TOKEN
    const clientId = process.env.TWITCH_CLIENT_ID
    if (!token || !clientId) return null

    const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Client-Id': clientId,
        },
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
        data: Array<{
            id: string
            login: string
            display_name: string
        }>
    }
    return json.data?.[0] ?? null
}

export function setupTwitchRoutes(app: Express): void {
    app.get(
        '/api/twitch/users',
        requireAuth,
        asyncHandler(async (req: Request, res: Response) => {
            const login = req.query.login
            if (typeof login !== 'string' || login.length < 1) {
                throw AppError.badRequest('login query parameter required')
            }
            const user = await lookupTwitchUser(login.toLowerCase())
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
            const { twitchUserId, twitchLogin, discordChannelId } = req.body
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
            const { twitchUserId } = req.body
            const success = await twitchNotificationService.remove(
                guildId,
                twitchUserId,
            )
            res.json({ success })
        }),
    )
}
