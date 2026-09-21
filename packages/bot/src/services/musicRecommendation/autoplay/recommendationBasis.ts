/**
 * Recommendation basis types for autoplay track selection.
 * Tracks the source and signals that led to a candidate track being scored.
 */

export type RecommendationSource =
    | 'spotify-rec'
    | 'spotify-taste'
    | 'seed-similar'
    | 'lastfm-loved'
    | 'lastfm-similar'
    | 'lastfm-genre-fallback'
    | 'artist-fallback'
    | 'genre-tag'

export type RecommendationSignal =
    | 'preferred artist'
    | 'favourite artist'
    | 'liked artist'
    | 'known artist'
    | 'liked track'
    | 'old dislike'
    | 'skipped before'
    | 'completed before'
    | 'implicit dislike'
    | 'album match'
    | 'deep-dive artist'
    | 'session novelty'
    | 'source variety'
    | 'similar title mood'
    | 'similar energy'
    | 'long track penalty'
    | 'deep dive'
    | 'long track match'
    | 'quick hit match'
    | 'restless discovery'
    | 'spotify preferred'
    | 'genre family drift'
    | 'version variant'
    | 'low quality upload'
    | 'discovery boost'
    | 'energy match'
    | 'replay frequent'
    | 'recency decay'

export interface RecommendationBasis {
    source: RecommendationSource
    signals: RecommendationSignal[]
}

/**
 * Formats a recommendation basis as a human-friendly label for Discord display.
 * Produces clean output without duplicates, mapping the source to a readable label first,
 * then appending significant signals joined with " • ".
 *
 * Example output: "spotify rec • preferred artist • completed before"
 *
 * @param basis - The recommendation basis containing source and signals
 * @returns Formatted string suitable for Discord display
 */
export function serializeBasis(basis: RecommendationBasis): string {
    const sourceLabels: Record<RecommendationSource, string> = {
        'spotify-rec': 'spotify rec',
        'spotify-taste': 'spotify taste',
        'seed-similar': 'seed similar',
        'lastfm-loved': 'last.fm loved',
        'lastfm-similar': 'last.fm similar',
        'lastfm-genre-fallback': 'last.fm genre',
        'artist-fallback': 'artist fallback',
        'genre-tag': 'genre tag',
    }

    const sourceLabel = sourceLabels[basis.source]

    const uniqueSignals = Array.from(new Set(basis.signals))

    if (uniqueSignals.length === 0) {
        return sourceLabel
    }

    const signalsFormatted = uniqueSignals.join(' • ')
    return `${sourceLabel} • ${signalsFormatted}`
}
