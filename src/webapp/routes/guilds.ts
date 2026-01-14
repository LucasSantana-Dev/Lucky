import type { Express, Response } from 'express'
import { errorLog } from '../../utils/general/log'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { sessionService } from '../services/SessionService'
import { guildService } from '../services/GuildService'

export function setupGuildRoutes(app: Express): void {
    app.get('/api/guilds', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const sessionId = req.sessionId
            if (!sessionId) {
                return res.status(401).json({ error: 'Not authenticated' })
            }

            const sessionData = await sessionService.getSession(sessionId)
            if (!sessionData) {
                return res.status(401).json({ error: 'Session expired' })
            }

            const guilds = await guildService.getUserGuilds(sessionData.accessToken)
            const enrichedGuilds = await guildService.enrichGuildsWithBotStatus(guilds)

            res.json({ guilds: enrichedGuilds })
        } catch (error) {
            errorLog({ message: 'Error fetching guilds:', error })
            res.status(500).json({ error: 'Failed to fetch guilds' })
        }
    })

    app.get('/api/guilds/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]

            const guildDetails = await guildService.getGuildDetails(id)

            if (!guildDetails) {
                return res.status(404).json({ error: 'Guild not found or bot not in guild' })
            }

            res.json(guildDetails)
        } catch (error) {
            errorLog({ message: 'Error fetching guild details:', error })
            res.status(500).json({ error: 'Failed to fetch guild details' })
        }
    })

    app.get('/api/guilds/:id/invite', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]

            const inviteUrl = guildService.generateBotInviteUrl(id)

            res.json({ inviteUrl })
        } catch (error) {
            errorLog({ message: 'Error generating invite URL:', error })
            res.status(500).json({ error: 'Failed to generate invite URL' })
        }
    })
}
