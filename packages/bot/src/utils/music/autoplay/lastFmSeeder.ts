import type { GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { lastFmLinkService } from '@lucky/shared/services'
import { getSimilarTracks } from '../../../lastfm'
import {
    cleanSearchQuery,
    cleanTitle,
    cleanAuthor,
} from '../searchQueryCleaner'
import {
    consumeLastFmSeedSlice,
    consumeBlendedSeedSlice,
    
} from './lastFmSeeds'
import type { SessionMood } from './sessionMood'
import { searchLastFmQuery, calculateRecommendationScore } from '../queueManipulation.js'
import type { Track } from 'discord-player'

// Types (duplicated from queueManipulation.ts to avoid circular dependency)
type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

// Constants
const AUTOPLAY_BUFFER_SIZE = 8
const LASTFM_SEED_COUNT = 3
const LASTFM_SCORE_BOOST = 0.0
const MAX_SIMILAR_LOOKUPS = 5

// Helper functions (duplicated from queueManipulation.ts to avoid circular dependency)
function stripFeaturing(author: string): string {
    const lower = author.toLowerCase()
    for (const kw of [' feat ', ' ft ', ' con ', ' with ']) {
        const idx = lower.indexOf(kw)
        if (idx >= 0) return author.slice(0, idx)
    }
    return author
}

function normalizeText(value?: string): string {
    return (value ?? '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
}

function normalizeTrackKey(title?: string, author?: string): string {
    const cleanedTitle = title ? cleanTitle(title) : ''
    const primaryAuthor = author
        ? stripFeaturing(cleanAuthor(author).split(',')[0] ?? '').trim()
        : ''
    return `${normalizeText(cleanedTitle)}::${normalizeText(primaryAuthor)}`
}

function getTrackKey(track: Track): string {
    return track.id || track.url || normalizeTrackKey(track.title, track.author)
}

function shouldIncludeCandidate(
    track: Track,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
): boolean {
    if (track.url && excludedUrls.has(track.url)) return false

    const normalizedKey = normalizeTrackKey(track.title, track.author)
    if (normalizedKey !== '::' && excludedKeys.has(normalizedKey))
        return false
    const trackKey = getTrackKey(track)
    if (excludedKeys.has(trackKey)) return false

    return true
}

function upsertScoredCandidate(
    candidates: Map<string, ScoredTrack>,
    candidate: Track,
    recommendation: { score: number; reason: string },
): void {
    const normalizedKey = normalizeTrackKey(candidate.title, candidate.author)
    const candidateKey =
        normalizedKey !== '::' ? normalizedKey : getTrackKey(candidate)
    const existing = candidates.get(candidateKey)

    if (!existing || recommendation.score > existing.score) {
        candidates.set(candidateKey, {
            track: candidate,
            score: recommendation.score,
            reason: recommendation.reason,
        })
    }
}

export async function collectLastFmCandidates(
    queue: GuildQueue,
    requestedBy: User,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedWeights: Map<string, number>,
    likedWeights: Map<string, number>,
    preferredArtistKeys: Set<string>,
    blockedArtistKeys: Set<string>,
    currentTrack: Track,
    recentArtists: Set<string>,
    candidates: Map<string, ScoredTrack>,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    sessionMood: SessionMood | null = null,
    contributionWeights?: Map<string, number>,
): Promise<void> {
    const metadata = queue.metadata as {
        vcMemberIds?: string[]
    }
    const vcMemberIds = metadata?.vcMemberIds ?? []

    const otherUserIds = vcMemberIds.filter((id) => id !== requestedBy.id)

    let seedSlice: { artist: string; title: string }[] = []
    if (otherUserIds.length > 0) {
        const linkedUsers = await Promise.all(
            [requestedBy.id, ...otherUserIds].map(async (id) => {
                const link = await lastFmLinkService.getByDiscordId(id)
                return link?.lastFmUsername ? id : null
            }),
        )
        const linkedUserIds = linkedUsers.filter(
            (id) => id !== null,
        ) as string[]

        if (linkedUserIds.length > 1) {
            seedSlice = await consumeBlendedSeedSlice(
                linkedUserIds,
                LASTFM_SEED_COUNT,
                contributionWeights,
            )
        } else if (linkedUserIds.length === 1) {
            seedSlice = await consumeLastFmSeedSlice(
                linkedUserIds[0],
                LASTFM_SEED_COUNT,
            )
        }
    } else {
        seedSlice = await consumeLastFmSeedSlice(
            requestedBy.id,
                LASTFM_SEED_COUNT,
        )
    }

    if (seedSlice.length === 0) return

    for (const seed of seedSlice) {
        const query = cleanSearchQuery(seed.title, seed.artist)
        const tracks = await searchLastFmQuery(queue, query, requestedBy)
        for (const track of tracks) {
            if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                continue
            const normalizedKey = normalizeTrackKey(track.title, track.author)
            const dislikedWeight = dislikedWeights.get(normalizedKey)
            if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue
            const rec = calculateRecommendationScore(
                track,
                currentTrack,
                recentArtists,
                likedWeights,
                preferredArtistKeys,
                blockedArtistKeys,
                autoplayMode,
                artistFrequency,
                implicitDislikeKeys,
                implicitLikeKeys,
                dislikedWeights,
                sessionMood,
                true,
            )
            if (rec.score === -Infinity) continue
            upsertScoredCandidate(candidates, track, {
                score: rec.score + LASTFM_SCORE_BOOST,
                reason: rec.reason
                    ? `${rec.reason} • last.fm taste`
                    : 'last.fm taste',
            })
        }

        const similar = await getSimilarTracks(
            seed.artist,
            cleanTitle(seed.title),
        )
        for (const s of similar.slice(0, MAX_SIMILAR_LOOKUPS)) {
            const query = cleanSearchQuery(s.title, s.artist)
            const tracks = await searchLastFmQuery(queue, query, requestedBy)
            for (const track of tracks) {
                if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                    continue
                const normalizedKey = normalizeTrackKey(
                    track.title,
                    track.author,
                )
                const dislikedWeight = dislikedWeights.get(normalizedKey)
                if (dislikedWeight !== undefined && dislikedWeight > 0.5)
                    continue
                const rec = calculateRecommendationScore(
                    track,
                    currentTrack,
                    recentArtists,
                    likedWeights,
                    preferredArtistKeys,
                    blockedArtistKeys,
                    autoplayMode,
                    artistFrequency,
                    implicitDislikeKeys,
                    implicitLikeKeys,
                    dislikedWeights,
                    null,
                    true,
                )
                upsertScoredCandidate(candidates, track, {
                    score: (rec.score + LASTFM_SCORE_BOOST) * (s.match / 100),
                    reason: rec.reason
                        ? `${rec.reason} • similar to your taste`
                        : 'similar to your taste',
                })
            }
            if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        }
    }
}
