import type { Express, Response } from 'express'
import { errorLog } from '@lucky/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { apiLimiter, writeLimiter } from '../middleware/rateLimit'
import { ArtistSuggestionService } from '../services/artistSuggestion'

const svc = new ArtistSuggestionService()
void svc.prewarmCache()

const wrap =
    (h: (r: AuthenticatedRequest) => Promise<any>, ctx: string, err: string) =>
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            res.json(await h(req))
        } catch (e: any) {
            const st = e?.status ?? 500
            const msg = e?.error ?? err
            if (st === 500) errorLog({ message: `${ctx} error`, error: e })
            res.status(st).json({ error: msg })
        }
    }

export function setupArtistsRoutes(app: Express): void {
    app.get(
        '/api/artists/suggestions',
        apiLimiter,
        requireAuth,
        wrap(
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
        wrap(
            async (r) => ({
                artists: await svc.handleSearchArtists(r.query.q),
            }),
            'Artist search',
            'Failed to search artists',
        ),
    )

    app.get(
        '/api/artists/:artistId/related',
        apiLimiter,
        requireAuth,
        wrap(
            async (r) => ({
                artists: await svc.handleGetRelatedArtists(r.params.artistId),
            }),
            'Related artists',
            'Failed to get related artists',
        ),
    )

    app.get(
        '/api/users/me/preferred-artists',
        apiLimiter,
        requireAuth,
        wrap(
            async (r) => ({
                preferences: await svc.handleGetPreferredArtists(
                    r.user?.id,
                    r.query.guildId,
                ),
            }),
            'Get preferred artists',
            'Failed to get preferences',
        ),
    )

    app.post(
        '/api/users/me/preferred-artists',
        writeLimiter,
        requireAuth,
        wrap(
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
        wrap(
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
        wrap(
            async (r) => {
                await svc.handleDeletePreferredArtist(
                    r.user?.id,
                    r.params.artistKey,
                    r.query.guildId,
                )
                return { success: true }
            },
            'Delete preferred artist',
            'Failed to delete preference',
        ),
    )
}
