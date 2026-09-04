import type { Track } from 'discord-player'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import {
    trackHistoryService,
    type TrackHistoryEntry,
} from '@lucky/shared/services'
import { areTracksSimilar, calculateSimilarityScore } from './similarityChecker'
import { extractTags } from './tagExtractor'
import type { DuplicateCheckResult, SimilarityConfig } from './types'

function toHistoryEntry(
    t: Track | TrackHistoryEntry,
    guildId: string,
): TrackHistoryEntry {
    if ('trackId' in t) {
        return { ...t, guildId, playedBy: t.playedBy || 'unknown' }
    }
    return {
        trackId: t.id || t.url,
        title: t.title,
        author: t.author,
        duration: t.duration,
        url: t.url,
        timestamp: Date.now(),
        guildId,
        playedBy: t.requestedBy?.id || 'unknown',
        isAutoplay: false,
    }
}

async function checkExactUrlMatch(
    _track: Track,
    _guildId: string,
): Promise<DuplicateCheckResult | null> {
    return null
}

async function checkSimilarTracks(
    track: Track,
    recentHistory: (Track | TrackHistoryEntry)[],
    config: SimilarityConfig,
    guildId: string,
): Promise<DuplicateCheckResult | null> {
    const similarTracks = recentHistory.filter((historyTrack) =>
        areTracksSimilar(track, historyTrack, config),
    )

    if (similarTracks.length > 0) {
        const similarityScores = similarTracks.map((historyTrack) =>
            calculateSimilarityScore(track, historyTrack, config),
        )
        const maxSimilarity = Math.max(...similarityScores)

        return {
            isDuplicate: true,
            reason: `Similar track found (${Math.round(maxSimilarity * 100)}% similarity)`,
            similarTracks: similarTracks.map((t) => toHistoryEntry(t, guildId)),
            confidence: maxSimilarity,
        }
    }
    return null
}

async function checkSameArtistTracks(
    track: Track,
    recentHistory: (Track | TrackHistoryEntry)[],
    guildId: string,
): Promise<DuplicateCheckResult | null> {
    const sameArtistTracks = recentHistory.filter(
        (historyTrack) =>
            historyTrack.author.toLowerCase() === track.author.toLowerCase(),
    )

    if (sameArtistTracks.length >= 3) {
        return {
            isDuplicate: true,
            reason: 'Too many tracks from the same artist recently',
            similarTracks: sameArtistTracks
                .slice(0, 3)
                .map((t) => toHistoryEntry(t, guildId)),
            confidence: 0.6,
        }
    }
    return null
}

/**
 * Check if a track is a duplicate based on various criteria
 */
export async function checkForDuplicate(
    track: Track,
    guildId: string,
    config: SimilarityConfig,
): Promise<DuplicateCheckResult> {
    try {
        const exactMatch = await checkExactUrlMatch(track, guildId)
        if (exactMatch) return exactMatch

        const recentHistory = await trackHistoryService.getTrackHistory(
            guildId,
            20,
        )

        const similarMatch = await checkSimilarTracks(
            track,
            recentHistory,
            config,
            guildId,
        )
        if (similarMatch) return similarMatch

        const sameArtistMatch = await checkSameArtistTracks(
            track,
            recentHistory,
            guildId,
        )
        if (sameArtistMatch) return sameArtistMatch

        return {
            isDuplicate: false,
        }
    } catch (error) {
        warnLog({
            message: 'Error checking for duplicates',
            error,
        })
        return {
            isDuplicate: false,
        }
    }
}

/**
 * Add a track to history and mark it as played
 */
export async function addTrackToHistory(
    track: Track,
    guildId: string,
): Promise<void> {
    try {
        const rawMetadata = (track as unknown as { metadata?: unknown })
            .metadata
        const metadata =
            rawMetadata && typeof rawMetadata === 'object'
                ? (rawMetadata as {
                      isAutoplay?: boolean
                      requestedQuery?: string
                  })
                : undefined

        await trackHistoryService.addTrackToHistory(
            {
                id: track.id || track.url,
                title: track.title,
                author: track.author,
                duration:
                    typeof track.duration === 'string'
                        ? track.duration
                        : String(track.duration),
                url: track.url,
                requestedQuery: metadata?.requestedQuery,
                metadata: { isAutoplay: Boolean(metadata?.isAutoplay) },
            },
            guildId,
            track.requestedBy?.id,
        )

        debugLog({
            message: 'Track added to history',
            data: {
                title: track.title,
                author: track.author,
                guildId,
            },
        })
    } catch (error) {
        errorLog({
            message: 'Error adding track to history',
            error,
        })
    }
}

/**
 * Get track metadata for analysis
 */
export async function getTrackMetadata(track: Track, _guildId: string) {
    const tags = extractTags(track)
    const genre = tags.find((tag) =>
        [
            'rock',
            'pop',
            'jazz',
            'blues',
            'country',
            'folk',
            'rap',
            'hip hop',
            'metal',
            'classical',
            'electronic',
            'dance',
            'reggae',
            'samba',
            'forro',
            'sertanejo',
            'mpb',
            'funk',
            'soul',
            'r&b',
            'indie',
            'alternative',
            'punk',
            'grunge',
            'techno',
            'house',
            'trance',
            'ambient',
            'acoustic',
            'instrumental',
        ].includes(tag),
    )

    return {
        artist: track.author,
        genre,
        tags,
        views: 1, // Default view count
    }
}
