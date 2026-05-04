import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { asyncHandler } from '../middleware/asyncHandler'
import { guildService } from '../services/GuildService'

export interface AdminGuildSummary {
    id: string
    name: string
    iconUrl: string | null
    memberCount: number | null
    textChannelCount: number | null
    voiceChannelCount: number | null
    roleCount: number | null
}

export function setupAdminRoutes(app: Express): void {
    app.get(
        '/api/admin/guilds',
        requireAuth,
        requireAdmin,
        asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
            const summaries = await guildService.getAllBotGuilds()
            res.json({ guilds: summaries })
        }),
    )
}
