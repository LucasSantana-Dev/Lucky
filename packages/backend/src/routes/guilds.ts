import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { sessionService } from '../services/SessionService'
import { guildService } from '../services/GuildService'

export function setupGuildRoutes(app: Express): void {
    app.get(
        '/api/guilds',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const sessionId = req.sessionId
            if (!sessionId) {
                throw AppError.unauthorized()
            }

            const sessionData = await sessionService.getSession(sessionId)
            if (!sessionData) {
                throw AppError.unauthorized('Session expired')
            }

            const guilds = await guildService.getUserGuilds(
                sessionData.accessToken,
            )
            const enrichedGuilds =
                await guildService.enrichGuildsWithBotStatus(guilds)

            res.json({ guilds: enrichedGuilds })
        }),
    )

    app.get(
        '/api/guilds/:id',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const id =
                typeof req.params.id === 'string'
                    ? req.params.id
                    : req.params.id[0]

            const guildDetails = await guildService.getGuildDetails(id)

            if (!guildDetails) {
                throw AppError.notFound('Guild not found or bot not in guild')
            }

            res.json(guildDetails)
        }),
    )

    app.get(
        '/api/guilds/:id/invite',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const id =
                typeof req.params.id === 'string'
                    ? req.params.id
                    : req.params.id[0]

            const inviteUrl = guildService.generateBotInviteUrl(id)

            res.json({ inviteUrl })
        }),
    )
}
