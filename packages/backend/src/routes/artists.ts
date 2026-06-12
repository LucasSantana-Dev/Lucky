import type { Express } from 'express'
import { requireAuth } from '../middleware/auth'
import { apiLimiter, writeLimiter } from '../middleware/rateLimit'
import { validateBody, validateQuery } from '../middleware/validate'
import { wrapHandler } from '../utils/routeUtils'
import { ArtistSuggestionService } from '../services/artistSuggestion'
import { artistsSchemas as s } from '../schemas/artists'

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
        return { artists: await svc.handleSearchArtists(r.query.q) }
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
        return {
            preferences: await svc.handleGetPreferredArtists(
                r.user?.id,
                r.query.guildId,
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
        await svc.handleDeletePreferredArtist(
            r.user?.id,
            r.params.artistKey as string,
            r.query.guildId as string,
        )
        return { success: true }
    },
    'Delete preferred artist',
    'Failed to delete preference',
)

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
        validateQuery(s.deletePreferenceQuery),
        delPref,
    )
}
