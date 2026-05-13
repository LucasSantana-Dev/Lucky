import { getArtistTopTags } from '../../../lastfm'

export type ArtistTagFetcher = (artist: string | undefined) => Promise<string[]>

export function hasGenreTag(tags: string[], genreVariants: string[]): boolean {
    if (tags.length === 0) return false
    const normalized = tags.map((t) => t.toLowerCase().trim())
    return genreVariants.some((g) => normalized.includes(g.toLowerCase().trim()))
}

/**
 * Per-pass de-duplicating artist-tag fetcher. The replenisher creates one per
 * autoplay pass and threads it through every candidate collector, so each
 * artist is only looked up once even when it surfaces in multiple sources.
 *
 * When a `spotifyFallback` is provided and Last.fm returns no tags (i.e. the
 * user has not linked Last.fm), the fetcher calls the fallback and caches its
 * result. This lets the cross-locale veto fire even for artists whose
 * title/author carry no Spanish text markers (e.g. "Marcos Witt", "Alex Zurdo").
 *
 * Each call returns a Promise so concurrent in-flight requests for the same
 * artist coalesce automatically.
 */
export function createArtistTagFetcher(
    spotifyFallback?: (artist: string) => Promise<string[]>,
): ArtistTagFetcher {
    const cache = new Map<string, Promise<string[]>>()

    return async (artist) => {
        if (!artist) return []
        const key = artist.toLowerCase().trim()
        if (!key) return []
        const cached = cache.get(key)
        if (cached) return cached
        const pending = getArtistTopTags(artist)
            .catch(() => [])
            .then(async (tags) => {
                if (tags.length === 0 && spotifyFallback) {
                    const result = await Promise.resolve(
                        spotifyFallback(artist),
                    ).catch(() => [])
                    return Array.isArray(result) ? result : []
                }
                return tags
            })
        cache.set(key, pending)
        return pending
    }
}
