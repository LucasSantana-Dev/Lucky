import type { Track } from 'discord-player'
import {
    cleanTitle,
    cleanAuthor,
} from '../../../utils/music/searchQueryCleaner'

/**
 * Normalize text by removing accents, lowercasing, and stripping non-alphanumeric.
 * Used for fuzzy matching and normalization in scoring and deduplication.
 */
export function normalizeText(value?: string): string {
    return (value ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}]+/gu, '')
        .trim()
}

/**
 * Strip featuring artists from a track author string.
 * Used during track normalization to extract the primary artist.
 */
export function stripFeaturing(author: string): string {
    const lower = author.toLowerCase()
    for (const kw of [' feat ', ' ft ', ' con ', ' with ']) {
        const idx = lower.indexOf(kw)
        if (idx >= 0) return author.slice(0, idx)
    }
    return author
}

/**
 * Normalize a track title and author into a cache key.
 * Used for deduplication and feature lookup.
 */
export function normalizeTrackKey(title?: string, author?: string): string {
    const cleanedTitle = title ? cleanTitle(title) : ''
    const primaryAuthor = author
        ? stripFeaturing(cleanAuthor(author).split(',')[0] ?? '').trim()
        : ''
    return `${normalizeText(cleanedTitle)}::${normalizeText(primaryAuthor)}`
}

// A vote rarely reaches the scorer through its own track key: the voted song
// sits in the last-150 history exclusion. Spread it to the artist instead.
// Per artist the decayed weights (0.15..1 each) are summed, so two dislikes
// weigh more than one, and capped so one heavily voted artist stays bounded.
const ARTIST_FEEDBACK_WEIGHT_CAP = 2

/**
 * Fold per-track feedback weights ("<title>::<primaryartist>" keys) into
 * per-artist weights keyed by the same normalized primary artist.
 */
export function buildArtistFeedbackWeights(
    trackWeights: Map<string, number>,
): Map<string, number> {
    const artistWeights = new Map<string, number>()
    for (const [trackKey, weight] of trackWeights) {
        const artistKey = trackKey.split('::')[1]
        if (!artistKey) continue
        artistWeights.set(
            artistKey,
            Math.min(
                ARTIST_FEEDBACK_WEIGHT_CAP,
                (artistWeights.get(artistKey) ?? 0) + weight,
            ),
        )
    }
    return artistWeights
}

/**
 * Extract Spotify track ID from a track URL or URI.
 * Returns null if no valid ID is found.
 */
export function extractSpotifyTrackId(track: Track): string | null {
    const match =
        track.url?.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/) ??
        track.url?.match(/^spotify:track:([A-Za-z0-9]+)/)
    return match?.[1] ?? null
}

/**
 * Extract YouTube video ID from a URL.
 * Supports both youtube.com and youtu.be short-form links.
 * Returns null if no valid ID is found.
 */
export function extractYouTubeVideoId(url: string): string | null {
    const idx = url.indexOf('v=')
    if (idx !== -1) {
        const id = url.slice(idx + 2, idx + 13).replace(/[^a-zA-Z0-9_-]/g, '')
        return id.length >= 8 ? id : null
    }
    const shortIdx = url.indexOf('youtu.be/')
    if (shortIdx !== -1) {
        const id = url
            .slice(shortIdx + 9, shortIdx + 20)
            .replace(/[^a-zA-Z0-9_-]/g, '')
        return id.length >= 8 ? id : null
    }
    return null
}
