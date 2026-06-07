import type { User } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import { getSimilarTracks } from '../../../lastfm'
import { createArtistTagFetcher } from './artistTagCache'
import { cleanSearchQuery, cleanTitle } from '../searchQueryCleaner'
import type { AutoplayContext } from './autoplayContext'
import { calculateRecommendationScore } from './candidateScorer'
import { normalizeTrackKey } from './scoringUtils'
import {
    shouldIncludeCandidate,
    upsertScoredCandidate,
} from './candidateCollector'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'
import { searchLastFmQuery } from './lastFmSeeder'

// Boost applied to every seed-similar candidate. Sits above the lastfm-similar
// boost (0.2) so the seed-grounded spine outranks weaker collateral sources
// when scores are otherwise close.
const SEED_SIMILAR_BOOST = 0.25
// Cap the number of similar tracks we look up + search per pass to bound
// Last.fm calls (~5 req/s public limit) and replenish latency.
const MAX_SEED_SIMILAR = 10
// Hard ceiling on the Last.fm similar fetch so a slow/hanging request never
// stalls the replenish pass; on timeout we fall through to the other sources.
const SEED_SIMILAR_TIMEOUT_MS = 2000
const AUTOPLAY_BUFFER_SIZE = 8
const SIMILAR_CACHE_TTL_MS = 60 * 60 * 1000
const SIMILAR_CACHE_MAX = 200

type SimilarTrack = { artist: string; title: string; match: number }

// Per-seed-track cache of Last.fm similar lookups. Keyed by artist::title so a
// repeated seed (deep-dive, loop) reuses the result for ~1h instead of hitting
// Last.fm every cycle. Only non-empty results are cached so a transient
// timeout/failure is retried on the next pass.
const similarCache = new Map<
    string,
    { tracks: SimilarTrack[]; expiresAt: number }
>()

async function fetchSeedSimilar(
    artist: string,
    title: string,
): Promise<SimilarTrack[]> {
    const key = `${artist.toLowerCase()}::${title.toLowerCase()}`
    const now = Date.now()
    const cached = similarCache.get(key)
    if (cached && cached.expiresAt > now) return cached.tracks

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<SimilarTrack[]>((resolve) => {
        timeoutId = setTimeout(() => resolve([]), SEED_SIMILAR_TIMEOUT_MS)
    })
    const tracks = await Promise.race([
        getSimilarTracks(artist, cleanTitle(title), MAX_SEED_SIMILAR),
        timeout,
    ])
        .catch(() => [] as SimilarTrack[])
        .finally(() => {
            if (timeoutId) clearTimeout(timeoutId)
        })

    if (tracks.length > 0) {
        if (similarCache.size >= SIMILAR_CACHE_MAX) {
            const oldest = similarCache.keys().next().value
            if (oldest) similarCache.delete(oldest)
        }
        similarCache.set(key, {
            tracks,
            expiresAt: now + SIMILAR_CACHE_TTL_MS,
        })
    }
    return tracks
}

/**
 * Seed-similarity spine: grounds autoplay on Last.fm `track.getSimilar` for the
 * currently-playing track, independent of whether any user has linked Last.fm.
 *
 * This is the tag-independent backbone source — `collectLastFmCandidates` only
 * runs for users with a linked Last.fm account, and the deprecated Spotify
 * recommendations endpoint returns little for this app, so without this source
 * an unlinked session collapses to genre-top-tracks (mainstream) and drifts.
 *
 * Guardrails: the fetch is wrapped in a 2s timeout + a ~1h per-seed cache and
 * capped to MAX_SEED_SIMILAR lookups; on empty/timeout it simply returns so the
 * other collectors and the broad fallback still run (never stalls the queue).
 */
export async function collectSeedSimilarCandidates(
    ctx: AutoplayContext,
    requestedBy: User,
    candidates: Map<string, ScoredTrack>,
    auditCollector?: AutoplayAuditCollector,
): Promise<void> {
    const seedArtist = ctx.currentTrack.author?.trim()
    const seedTitle = ctx.currentTrack.title?.trim()
    if (!seedArtist || !seedTitle) return

    const similar = await fetchSeedSimilar(seedArtist, seedTitle)
    if (similar.length === 0) return

    const getArtistTags =
        ctx.genreContext.getArtistTags ?? createArtistTagFetcher()
    const currentTrackTags = ctx.genreContext.currentTrackTags ?? []
    const sessionGenreFamilies =
        ctx.genreContext.sessionGenreFamilies ?? new Set<string>()

    for (const s of similar.slice(0, MAX_SEED_SIMILAR)) {
        if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        const query = cleanSearchQuery(s.title, s.artist)
        const tracks = await searchLastFmQuery(ctx.queue, query, requestedBy)
        for (const track of tracks) {
            if (
                !shouldIncludeCandidate(
                    track,
                    ctx.excludedUrls,
                    ctx.excludedKeys,
                )
            )
                continue
            const normalizedKey = normalizeTrackKey(track.title, track.author)
            const dislikedWeight = ctx.dislikedWeights.get(normalizedKey)
            if (dislikedWeight !== undefined && dislikedWeight > 0.5) continue
            const tags = await getArtistTags(track.author)
            const rec = calculateRecommendationScore({
                candidate: track,
                currentTrack: ctx.currentTrack,
                recentArtists: ctx.recentArtists,
                likedWeights: ctx.likedWeights,
                preferredArtistKeys: ctx.preferredArtistKeys,
                blockedArtistKeys: ctx.blockedArtistKeys,
                autoplayMode: ctx.autoplayMode,
                artistFrequency: ctx.artistFrequency,
                implicitDislikeKeys: ctx.implicitDislikeKeys,
                implicitLikeKeys: ctx.implicitLikeKeys,
                dislikedWeights: ctx.dislikedWeights,
                sessionMood: ctx.sessionMood,
                skipNoveltyBoost: true,
                genreContext: {
                    candidateTags: tags,
                    currentTrackTags,
                    sessionGenreFamilies,
                },
            })
            // Last.fm returns `match` on a 0..1 scale. Weight by it but keep
            // seed-similar competitive — never crush below 0.5× even on a weak
            // match, so the spine still grounds a thin pool.
            const matchWeight = 0.5 + 0.5 * Math.min(Math.max(s.match, 0), 1)
            upsertScoredCandidate(
                candidates,
                track,
                {
                    score: (rec.score + SEED_SIMILAR_BOOST) * matchWeight,
                    source: 'seed-similar',
                    signals: rec.signals,
                },
                auditCollector,
            )
        }
    }

    debugLog({
        message: 'Autoplay: seed-similar candidates collected',
        data: {
            seedArtist,
            seedTitle,
            similarCount: similar.length,
            total: candidates.size,
            source: 'seed-similar',
        },
    })
}
