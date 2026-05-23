import type { Express, Response } from 'express'
import { errorLog } from '@lucky/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { apiLimiter, writeLimiter } from '../middleware/rateLimit'
import { ArtistSuggestionService } from '../services/artistSuggestion'

interface ApiError {
    readonly status?: number
    readonly error?: string
}

const svc = new ArtistSuggestionService()
void svc.prewarmCache()

const wrapHandler =
    (
        h: (r: AuthenticatedRequest) => Promise<Record<string, unknown>>,
        ctx: string,
        defaultErr: string,
    ) =>
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
        try {
            res.json(await h(req))
        } catch (e: unknown) {
            const apiErr =
                typeof e === 'object' && e !== null ? (e as ApiError) : {}
            const st = typeof apiErr.status === 'number' ? apiErr.status : 500
            const msg =
                typeof apiErr.error === 'string' ? apiErr.error : defaultErr
            if (st === 500) errorLog({ message: `${ctx} error`, error: e })
            res.status(st).json({ error: msg })
        }
    }

export function setupArtistsRoutes(app: Express): void {
    app.get(
        '/api/artists/suggestions',
        apiLimiter,
        requireAuth,
        wrapHandler(
            async (r) => ({
                artists: await svc.handleGetSuggestions(r.user?.id),
            }),
            'Artist suggestions',
            'Failed to get suggestions',
        ),
    )
    app.get(
        '/api/artists/search',
        apiLimiter,
        requireAuth,
        wrapHandler(
            async (r) => {
                const q = typeof r.query.q === 'string' ? r.query.q : ''
                return { artists: await svc.handleSearchArtists(q) }
            },
            'Artist search',
            'Failed to search artists',
        ),
    )
    app.get(
        '/api/artists/:artistId/related',
        apiLimiter,
        requireAuth,
        wrapHandler(
            async (r) => {
                const artistId =
                    typeof r.params.artistId === 'string'
                        ? r.params.artistId
                        : ''
                return { artists: await svc.handleGetRelatedArtists(artistId) }
            },
            'Related artists',
            'Failed to get related artists',
        ),
    )
    app.get(
        '/api/users/me/preferred-artists',
        apiLimiter,
        requireAuth,
        wrapHandler(
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
        ),
    )
    app.post(
        '/api/users/me/preferred-artists',
        writeLimiter,
        requireAuth,
        wrapHandler(
            async (r) => ({
                preference: await svc.handleSavePreferredArtist(
                    r.user?.id,
                    r.body,
                ),
            }),
            'Save preferred artist',
            'Failed to save preference',
        ),
    )
    app.put(
        '/api/artists/preferences/batch',
        writeLimiter,
        requireAuth,
        wrapHandler(
            async (r) => ({
                preferences: await svc.handleBatchSavePreferences(
                    r.user?.id,
                    r.body,
                ),
            }),
            'Batch save preferences',
            'Failed to save preferences',
        ),
    )
    app.delete(
        '/api/users/me/preferred-artists/:artistKey',
        writeLimiter,
        requireAuth,
        wrapHandler(
            async (r) => {
                const artistKey =
                    typeof r.params.artistKey === 'string'
                        ? r.params.artistKey
                        : ''
                const guildId =
                    typeof r.query.guildId === 'string' ? r.query.guildId : ''
                await svc.handleDeletePreferredArtist(
                    r.user?.id,
                    artistKey,
                    guildId,
                )
                return { success: true }
            },
            'Delete preferred artist',
            'Failed to delete preference',
        ),
    )
}
