import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateQuery } from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { lyricsService } from '@lucky/shared/services'
import { z } from 'zod'

const lyricsQuery = z.object({
    title: z.string().min(1).max(200),
    artist: z.string().max(200).optional(),
})

export function setupLyricsRoutes(app: Express): void {
    app.get(
        '/api/lyrics',
        requireAuth,
        validateQuery(lyricsQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const title = req.query.title as string
            const artist = req.query.artist as string | undefined
            const result = await lyricsService.searchLyrics(title, artist)
            res.json(result)
        }),
    )
}
