import { getArtistTopTags } from '../../../lastfm'

export type ArtistTagFetcher = (artist: string | undefined) => Promise<string[]>

/**
 * Per-pass de-duplicating Last.fm artist-tag fetcher. The replenisher creates
 * one of these per autoplay pass and threads it through every candidate
 * collector so we only ask Last.fm for each artist once even when the same
 * artist surfaces in Spotify, Last.fm seeds, and genre searches.
 *
 * Each call returns a Promise so concurrent in-flight requests for the same
 * artist coalesce automatically.
 */
export function createArtistTagFetcher(): ArtistTagFetcher {
    const cache = new Map<string, Promise<string[]>>()

    return async (artist) => {
        if (!artist) return []
        const key = artist.toLowerCase().trim()
        if (!key) return []
        const cached = cache.get(key)
        if (cached) return cached
        const pending = getArtistTopTags(artist).catch(() => [])
        cache.set(key, pending)
        return pending
    }
}
