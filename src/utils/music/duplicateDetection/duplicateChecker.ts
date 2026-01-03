import type { Track } from 'discord-player'
import { debugLog } from '../../general/log'
import { ServiceFactory } from '../../../services/ServiceFactory'
import { areTracksSimilar, calculateSimilarityScore } from './similarityChecker'
import { extractTags } from './tagExtractor'
import type { DuplicateCheckResult, SimilarityConfig } from './types'
// import type { TrackLike } from '../../../types/music'

async function checkExactUrlMatch(
    track: Track,
    guildId: string,
): Promise<DuplicateCheckResult | null> {
    const trackHistoryService = ServiceFactory.getTrackHistoryService()
    const exactMatch = await trackHistoryService.isDuplicateTrack(
        guildId,
        track.url,
    )
    if (exactMatch) {
        return {
            isDuplicate: true,
            reason: 'Exact URL match found in recent history',
            confidence: 1.0,
        }
    }
    return null
}

async function checkSimilarTracks(
    track: Track,
    recentHistory: Track[],
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
            similarTracks: similarTracks.map((t) => ({
                trackId: t.id || t.url,
                title: t.title,
                author: t.author,
                duration: t.duration,
                url: t.url,
                timestamp: Date.now(),
                guildId: guildId,
                playedBy: t.requestedBy?.id || 'unknown',
                isAutoplay: false,
            })),
            confidence: maxSimilarity,
        }
    }
    return null
}

async function checkSameArtistTracks(
    track: Track,
    recentHistory: Track[],
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
                .map((t) => ({
                    trackId: t.id || t.url,
                    title: t.title,
                    author: t.author,
                    duration: t.duration,
                    url: t.url,
                    timestamp: Date.now(),
                    guildId: guildId,
                    playedBy: t.requestedBy?.id || 'unknown',
                    isAutoplay: false,
                })),
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

        const trackHistoryService = ServiceFactory.getTrackHistoryService()
        const recentHistory = await trackHistoryService.getTrackHistory(
            guildId,
            20,
        )

        const similarMatch = await checkSimilarTracks(
            track,
            recentHistory as unknown as Track[],
            config,
            guildId,
        )
        if (similarMatch) return similarMatch

        const sameArtistMatch = await checkSameArtistTracks(
            track,
            recentHistory as unknown as Track[],
            guildId,
        )
        if (sameArtistMatch) return sameArtistMatch

        return {
            isDuplicate: false,
        }
    } catch (error) {
        debugLog({
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
        const trackHistoryService = ServiceFactory.getTrackHistoryService()
        await trackHistoryService.addTrackToHistory(track, guildId)
        await trackHistoryService.markTrackAsPlayed(guildId, track.url)

        debugLog({
            message: 'Track added to history',
            data: {
                title: track.title,
                author: track.author,
                guildId,
            },
        })
    } catch (error) {
        debugLog({
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
