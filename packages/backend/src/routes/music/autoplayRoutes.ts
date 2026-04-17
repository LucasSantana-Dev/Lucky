import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { guildSettingsService } from '@lucky/shared/services'
import { param } from './helpers'

export function setupAutoplayRoutes(app: Express): void {
    // GET /api/guilds/:guildId/autoplay/genres
    app.get(
        '/api/guilds/:guildId/autoplay/genres',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const settings = await guildSettingsService.getGuildSettings(guildId)
            const genres = settings?.autoplayGenres ?? []
            res.json({ genres })
        }),
    )

    // PUT /api/guilds/:guildId/autoplay/genres
    app.put(
        '/api/guilds/:guildId/autoplay/genres',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const { genres } = req.body as Record<string, unknown>

            if (!Array.isArray(genres)) {
                res.status(400).json({
                    error: 'Invalid request',
                    message: 'genres must be an array',
                })
                return
            }

            // Validate genres array length
            if (genres.length > 5) {
                res.status(400).json({
                    error: 'Limit exceeded',
                    message: 'Maximum 5 genres allowed',
                })
                return
            }

            // Normalize and deduplicate
            const normalized = [...new Set(genres.map(g => String(g).toLowerCase().trim()))].filter(Boolean)

            const updated = await guildSettingsService.updateGuildSettings(guildId, {
                autoplayGenres: normalized,
            })

            if (!updated) {
                res.status(500).json({
                    error: 'Update failed',
                    message: 'Failed to update guild settings',
                })
                return
            }

            res.json({ genres: normalized })
        }),
    )
}
