import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { apiLimiter, writeLimiter } from '../middleware/rateLimit'
import {
    validateBody,
    validateQuery,
    validateParams,
} from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { ArtistSuggestionService } from '../services/artistSuggestion'
import { artistsSchemas as s } from '../schemas/artists'

const svc = new ArtistSuggestionService()
void svc.prewarmCache()

/** Exported for test isolation (resetting the in-memory suggestion caches). */
export const artistSuggestionService = svc

const sugg = asyncHandler(async (r: AuthenticatedRequest, res: Response) => {
    res.json({ artists: await svc.handleGetSuggestions(r.user?.id) })
})

const search = asyncHandler(async (r: AuthenticatedRequest, res: Response) => {
    res.json({ artists: await svc.handleSearchArtists(r.query.q) })
})

const related = asyncHandler(async (r: AuthenticatedRequest, res: Response) => {
    const artistId =
        typeof r.params.artistId === 'string' ? r.params.artistId : ''
    res.json({ artists: await svc.handleGetRelatedArtists(artistId) })
})

const prefs = asyncHandler(async (r: AuthenticatedRequest, res: Response) => {
    res.json({
        preferences: await svc.handleGetPreferredArtists(
            r.user?.id,
            r.query.guildId,
        ),
    })
})

const save = asyncHandler(async (r: AuthenticatedRequest, res: Response) => {
    res.json({
        preference: await svc.handleSavePreferredArtist(r.user?.id, r.body),
    })
})

const batch = asyncHandler(async (r: AuthenticatedRequest, res: Response) => {
    res.json({
        preferences: await svc.handleBatchSavePreferences(r.user?.id, r.body),
    })
})

const delPref = asyncHandler(async (r: AuthenticatedRequest, res: Response) => {
    await svc.handleDeletePreferredArtist(
        r.user?.id,
        r.params.artistKey as string,
        r.query.guildId as string,
    )
    res.json({ success: true })
})

export function setupArtistsRoutes(app: Express): void {
    app.get('/api/artists/suggestions', apiLimiter, requireAuth, sugg)
    app.get(
        '/api/artists/search',
        apiLimiter,
        requireAuth,
        validateQuery(s.searchQuery),
        search,
    )
    app.get('/api/artists/:artistId/related', apiLimiter, requireAuth, related)
    app.get(
        '/api/users/me/preferred-artists',
        apiLimiter,
        requireAuth,
        validateQuery(s.preferredArtistsQuery),
        prefs,
    )
    app.post(
        '/api/users/me/preferred-artists',
        writeLimiter,
        requireAuth,
        validateBody(s.savePreferenceBody),
        save,
    )
    app.put(
        '/api/artists/preferences/batch',
        writeLimiter,
        requireAuth,
        validateBody(s.batchSavePreferencesBody),
        batch,
    )
    app.delete(
        '/api/users/me/preferred-artists/:artistKey',
        writeLimiter,
        requireAuth,
        validateParams(s.deletePreferenceParams),
        validateQuery(s.deletePreferenceQuery),
        delPref,
    )
}
