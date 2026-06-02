import type { Express } from 'express'
import { requireAuth } from '../middleware/auth'
import { apiLimiter, writeLimiter } from '../middleware/rateLimit'
import { wrapHandler } from '../utils/routeUtils'
import { ArtistSuggestionService } from '../services/artistSuggestion'

const svc = new ArtistSuggestionService()
void svc.prewarmCache()

/** Exported for test isolation (resetting the in-memory suggestion caches). */
export const artistSuggestionService = svc

const sugg = wrapHandler(
    async (r) => ({ artists: await svc.handleGetSuggestions(r.user?.id) }),
    'Artist suggestions',
    'Failed to get suggestions',
)

const search = wrapHandler(
    async (r) => {
        const q = typeof r.query.q === 'string' ? r.query.q : ''
        return { artists: await svc.handleSearchArtists(q) }
    },
    'Artist search',
    'Failed to search artists',
)

const related = wrapHandler(
    async (r) => {
        const artistId =
            typeof r.params.artistId === 'string' ? r.params.artistId : ''
        return { artists: await svc.handleGetRelatedArtists(artistId) }
    },
    'Related artists',
    'Failed to get related artists',
)

const prefs = wrapHandler(
    async (r) => {
        const guildId =
            typeof r.query.guildId === 'string' ? r.query.guildId : ''
        return {
            preferences: await svc.handleGetPreferredArtists(
                r.user?.id,
                guildId,
            ),
        }
    },
    'Get preferred artists',
    'Failed to get preferences',
)

const save = wrapHandler(
    async (r) => ({
        preference: await svc.handleSavePreferredArtist(r.user?.id, r.body),
    }),
    'Save preferred artist',
    'Failed to save preference',
)

const batch = wrapHandler(
    async (r) => ({
        preferences: await svc.handleBatchSavePreferences(r.user?.id, r.body),
    }),
    'Batch save preferences',
    'Failed to save preferences',
)

const delPref = wrapHandler(
    async (r) => {
        const artistKey =
            typeof r.params.artistKey === 'string' ? r.params.artistKey : ''
        const guildId =
            typeof r.query.guildId === 'string' ? r.query.guildId : ''
        await svc.handleDeletePreferredArtist(r.user?.id, artistKey, guildId)
        return { success: true }
    },
    'Delete preferred artist',
    'Failed to delete preference',
)

export function setupArtistsRoutes(app: Express): void {
    app.get('/api/artists/suggestions', apiLimiter, requireAuth, sugg)
    app.get('/api/artists/search', apiLimiter, requireAuth, search)
    app.get('/api/artists/:artistId/related', apiLimiter, requireAuth, related)
    app.get('/api/users/me/preferred-artists', apiLimiter, requireAuth, prefs)
    app.post('/api/users/me/preferred-artists', writeLimiter, requireAuth, save)
    app.put('/api/artists/preferences/batch', writeLimiter, requireAuth, batch)
    app.delete(
        '/api/users/me/preferred-artists/:artistKey',
        writeLimiter,
        requireAuth,
        delPref,
    )
}
