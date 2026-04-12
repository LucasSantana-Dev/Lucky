import {
    QueryType,
    QueueRepeatMode,
    type Track,
    type GuildQueue,
} from 'discord-player'
import { randomInt } from 'node:crypto'
import type { User } from 'discord.js'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'
import {
    trackHistoryService,
    guildSettingsService,
} from '@lucky/shared/services'
import { consumeLastFmSeedSlice } from './autoplay/lastFmSeeds'
import { getSimilarTracks, getTagTopTracks } from '../../lastfm'
import { cleanSearchQuery, cleanTitle, cleanAuthor } from './searchQueryCleaner'
import type { QueueMetadata } from '../../types/QueueMetadata'

const AUTOPLAY_BUFFER_SIZE = 8
const HISTORY_SEED_LIMIT = 3
const SEARCH_RESULTS_LIMIT = 8
const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
const LASTFM_SEED_COUNT = 3
const LASTFM_SCORE_BOOST = 0.1
const MAX_SIMILAR_LOOKUPS = 5
const QUEUE_RESCUE_PROBE_TIMEOUT_MS = Number.parseInt(
    process.env.QUEUE_RESCUE_PROBE_TIMEOUT_MS ?? '5000',
    10,
)
const QUEUE_RESCUE_REFILL_THRESHOLD = Number.parseInt(
    process.env.QUEUE_RESCUE_REFILL_THRESHOLD ?? '3',
    10,
)

type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

export type QueueRescueResult = {
    removedTracks: number
    keptTracks: number
    addedTracks: number
}

export async function clearQueue(queue: GuildQueue): Promise<boolean> {
    try {
        queue.clear()
        debugLog({ message: 'Queue cleared successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error clearing queue:', error })
        return false
    }
}

export async function shuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) return true

        for (let i = tracks.length - 1; i > 0; i--) {
            const j = randomIndex(i + 1)
            ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
        }

        queue.clear()
        for (const track of tracks) {
            queue.addTrack(track)
        }

        debugLog({ message: 'Queue shuffled successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error shuffling queue:', error })
        return false
    }
}

export async function smartShuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) return true

        const pool = [...tracks]
        const shuffled: Track[] = []
        const initialByUser = new Map<string, number>()
        const placedByUser = new Map<string, number>()

        for (const track of pool) {
            const userId = track.requestedBy?.id ?? 'autoplay'
            initialByUser.set(userId, (initialByUser.get(userId) ?? 0) + 1)
        }

        while (pool.length > 0) {
            const scored = pool.map((track, index) => {
                const userId = track.requestedBy?.id ?? 'autoplay'
                const totalForUser = initialByUser.get(userId) ?? 1
                const placedForUser = placedByUser.get(userId) ?? 0
                const fairnessScore = placedForUser / totalForUser
                return {
                    track,
                    index,
                    score: fairnessScore + randomJitter(0.05),
                }
            })

            scored.sort((a, b) => a.score - b.score)
            const candidateWindow = scored.slice(0, Math.min(3, scored.length))
            const chosen = candidateWindow[randomIndex(candidateWindow.length)]
            if (!chosen) break

            const userId = chosen.track.requestedBy?.id ?? 'autoplay'
            placedByUser.set(userId, (placedByUser.get(userId) ?? 0) + 1)
            shuffled.push(chosen.track)
            pool.splice(chosen.index, 1)
        }

        queue.clear()
        for (const track of shuffled) {
            queue.addTrack(track)
        }

        debugLog({
            message: 'Queue smart-shuffled successfully',
            data: { guildId: queue.guild.id, queueSize: queue.tracks.size },
        })
        return true
    } catch (error) {
        errorLog({ message: 'Error smart-shuffling queue:', error })
        return false
    }
}

export async function removeTrackFromQueue(
    queue: GuildQueue,
    position: number,
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (position < 0 || position >= tracks.length) return null

        const track = tracks[position]
        queue.node.remove(track)
        debugLog({
            message: 'Track removed from queue',
            data: { position, track: track.title },
        })
        return track
    } catch (error) {
        errorLog({ message: 'Error removing track from queue:', error })
        return null
    }
}

export async function moveTrackInQueue(
    queue: GuildQueue,
    fromPosition: number,
    toPosition: number,
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (
            fromPosition < 0 ||
            fromPosition >= tracks.length ||
            toPosition < 0 ||
            toPosition >= tracks.length
        )
            return null

        const track = tracks[fromPosition]
        queue.node.remove(track)

        const newTracks = queue.tracks.toArray()
        if (toPosition >= newTracks.length) {
            queue.addTrack(track)
        } else {
            queue.insertTrack(track, toPosition)
        }

        debugLog({
            message: 'Track moved in queue',
            data: { track: track.title, from: fromPosition, to: toPosition },
        })
        return track
    } catch (error) {
        errorLog({ message: 'Error moving track in queue:', error })
        return null
    }
}

// Per-guild mutex: serializes concurrent replenishQueue calls so two events
// firing within milliseconds (playerStart + playerFinish) cannot both read
// the same exclusion sets and independently select the same track.
const replenishLocks = new Map<string, Promise<void>>()

// Per-guild counter for query diversity across multiple replenish calls.
const replenishCounters = new Map<string, number>()

export function replenishQueue(
    queue: GuildQueue,
    finishedTrack?: Track,
): Promise<void> {
    const guildId = queue.guild.id
    const prev = replenishLocks.get(guildId) ?? Promise.resolve()
    const next = prev.then(() => _replenishQueue(queue, finishedTrack))
    replenishLocks.set(
        guildId,
        next.catch(() => {}),
    )
    return next
}

async function _replenishQueue(
    queue: GuildQueue,
    finishedTrack?: Track,
): Promise<void> {
    try {
        debugLog({
            message: 'Replenishing queue',
            data: { guildId: queue.guild.id, queueSize: queue.tracks.size },
        })

        const currentTrack = queue.currentTrack ?? finishedTrack ?? null
        if (!currentTrack) return

        const missingTracks = AUTOPLAY_BUFFER_SIZE - queue.tracks.size
        if (missingTracks <= 0) return

        const historyTracks = getHistoryTracks(queue)
        const seedTracks = [currentTrack, ...historyTracks].slice(
            0,
            HISTORY_SEED_LIMIT + 1,
        )
        const requestedBy = getRequestedBy(queue, currentTrack)
        const [
            dislikedTrackKeys,
            likedTrackKeys,
            persistentHistory,
            guildSettings,
        ] = await Promise.all([
            recommendationFeedbackService.getDislikedTrackKeys(
                queue.guild.id,
                requestedBy?.id,
            ),
            recommendationFeedbackService.getLikedTrackKeys(
                queue.guild.id,
                requestedBy?.id,
            ),
            trackHistoryService.getTrackHistory(queue.guild.id, 100),
            guildSettingsService.getGuildSettings(queue.guild.id),
        ])
        const autoplayMode = guildSettings?.autoplayMode ?? 'similar'
        if (persistentHistory.length === 0) {
            warnLog({
                message:
                    'Autoplay: persistent history empty — Redis may be unavailable',
                data: { guildId: queue.guild.id },
            })
        }
        const excludedUrls = buildExcludedUrls(
            queue,
            currentTrack,
            historyTracks,
            persistentHistory,
        )
        const excludedKeys = buildExcludedKeys(
            queue,
            currentTrack,
            historyTracks,
            persistentHistory,
        )
        debugLog({
            message: 'Autoplay: exclusion sets built',
            data: {
                guildId: queue.guild.id,
                excludedUrlCount: excludedUrls.size,
                excludedKeyCount: excludedKeys.size,
                historyTracks: historyTracks.length,
                persistentHistory: persistentHistory.length,
            },
        })
        const recentArtists = buildRecentArtists(currentTrack, historyTracks)
        const guildId = queue.guild.id
        const replenishCount = replenishCounters.get(guildId) ?? 0
        const candidates = await collectRecommendationCandidates(
            queue,
            seedTracks,
            requestedBy,
            excludedUrls,
            excludedKeys,
            dislikedTrackKeys,
            likedTrackKeys,
            currentTrack,
            recentArtists,
            replenishCount,
            autoplayMode,
        )
        if (requestedBy?.id) {
            await collectLastFmCandidates(
                queue,
                requestedBy,
                excludedUrls,
                excludedKeys,
                dislikedTrackKeys,
                likedTrackKeys,
                currentTrack,
                recentArtists,
                candidates,
                autoplayMode,
            )
        }
        if (guildSettings?.autoplayGenres && guildSettings.autoplayGenres.length > 0) {
            await collectGenreCandidates(
                queue,
                guildSettings.autoplayGenres,
                candidates,
                recentArtists,
                likedTrackKeys,
                dislikedTrackKeys,
                currentTrack,
                requestedBy,
                excludedUrls,
                excludedKeys,
                autoplayMode,
            )
        }
        if (candidates.size === 0 && currentTrack) {
            await collectBroadFallbackCandidates(
                queue,
                currentTrack,
                requestedBy,
                excludedUrls,
                excludedKeys,
                dislikedTrackKeys,
                likedTrackKeys,
                recentArtists,
                candidates,
                autoplayMode,
            )
        }

        const selected = selectDiverseCandidates(candidates, missingTracks)

        await addSelectedTracks(
            queue,
            selected,
            excludedUrls,
            excludedKeys,
            requestedBy?.id,
        )

        // Increment replenish counter for next call's query variation
        replenishCounters.set(guildId, replenishCount + 1)

        if (selected.length === 0) return

        debugLog({
            message: 'Queue replenished successfully',
            data: {
                guildId: queue.guild.id,
                addedCount: selected.length,
                queueSize: queue.tracks.size,
            },
        })
    } catch (error) {
        errorLog({ message: 'Error replenishing queue:', error })
    }
}

function randomIndex(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0
    return randomInt(maxExclusive)
}

function randomJitter(max: number): number {
    if (max <= 0) return 0
    return (randomInt(10_000) / 10_000) * max
}

function getRequestedBy(queue: GuildQueue, currentTrack: Track): User | null {
    const metadata = queue.metadata as QueueMetadata | undefined
    return currentTrack.requestedBy ?? metadata?.requestedBy ?? null
}

function extractYouTubeVideoId(url: string): string | null {
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

function buildExcludedUrls(
    queue: GuildQueue,
    currentTrack: Track,
    historyTracks: Track[],
    persistentHistory: { url: string }[] = [],
): Set<string> {
    const allUrls = [
        currentTrack.url,
        ...historyTracks.map((t) => t.url),
        ...queue.tracks.toArray().map((t) => t.url),
        ...persistentHistory.map((e) => e.url).filter(Boolean),
    ]
    const result = new Set<string>()
    for (const url of allUrls) {
        if (url) {
            result.add(url)
            const vid = extractYouTubeVideoId(url)
            if (vid) result.add(vid)
        }
    }
    return result
}

function buildExcludedKeys(
    queue: GuildQueue,
    currentTrack: Track,
    historyTracks: Track[],
    persistentHistory: { title: string; author: string }[] = [],
): Set<string> {
    const allTracks: { title?: string; author?: string }[] = [
        currentTrack,
        ...historyTracks,
        ...queue.tracks.toArray(),
        ...persistentHistory,
    ]
    const keys: string[] = []
    for (const t of allTracks) {
        keys.push(normalizeTrackKey(t.title, t.author))
        keys.push(normalizeTitleOnly(t.title))
    }
    return new Set(keys)
}

function buildRecentArtists(
    currentTrack: Track,
    historyTracks: Track[],
): Set<string> {
    return new Set<string>(
        [currentTrack.author, ...historyTracks.map((track) => track.author)]
            .filter(Boolean)
            .map((artist) => artist.toLowerCase()),
    )
}

async function collectRecommendationCandidates(
    queue: GuildQueue,
    seedTracks: Track[],
    requestedBy: User | null,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedTrackKeys: Set<string>,
    likedTrackKeys: Set<string>,
    currentTrack: Track,
    recentArtists: Set<string>,
    replenishCount = 0,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
): Promise<Map<string, ScoredTrack>> {
    const candidates = new Map<string, ScoredTrack>()

    for (const seed of seedTracks) {
        const seedCandidates = await searchSeedCandidates(
            queue,
            seed,
            requestedBy,
            replenishCount,
        )
        for (const candidate of seedCandidates) {
            if (
                !shouldIncludeCandidate(candidate, excludedUrls, excludedKeys)
            ) {
                continue
            }
            const normalizedKey = normalizeTrackKey(
                candidate.title,
                candidate.author,
            )
            if (dislikedTrackKeys.has(normalizedKey)) {
                continue
            }
            upsertScoredCandidate(
                candidates,
                candidate,
                calculateRecommendationScore(
                    candidate,
                    currentTrack,
                    recentArtists,
                    likedTrackKeys,
                    autoplayMode,
                ),
            )
        }
    }

    return candidates
}

const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000
const QUERY_MODIFIERS = ['', 'similar', 'like', 'playlist', 'mix']

async function searchSeedCandidates(
    queue: GuildQueue,
    seed: Track,
    requestedBy: User | null,
    replenishCount = 0,
): Promise<Track[]> {
    const baseQuery = cleanSearchQuery(seed.title, seed.author)
    const modifier = QUERY_MODIFIERS[replenishCount % QUERY_MODIFIERS.length]
    const query = modifier ? `${baseQuery} ${modifier}` : baseQuery

    const engines: QueryType[] = [
        QueryType.SPOTIFY_SEARCH,
        QueryType.YOUTUBE_SEARCH,
        QueryType.AUTO,
    ]

    for (const engine of engines) {
        try {
            const searchResult = await queue.player.search(query, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: engine,
            })

            const tracks = searchResult.tracks
                .filter(
                    (t) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)

            if (tracks.length > 0) return tracks
        } catch (error) {
            debugLog({
                message: 'Search failed for seed, trying next engine',
                data: { query, engine, error: String(error) },
            })
        }
    }

    return []
}

async function collectBroadFallbackCandidates(
    queue: GuildQueue,
    currentTrack: Track,
    requestedBy: User | null,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedTrackKeys: Set<string>,
    likedTrackKeys: Set<string>,
    recentArtists: Set<string>,
    candidates: Map<string, ScoredTrack>,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
): Promise<void> {
    const fallbackQueries = [
        currentTrack.author,
        `${currentTrack.author} popular`,
    ].filter(Boolean)

    for (const query of fallbackQueries) {
        try {
            const result = await queue.player.search(query, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: QueryType.SPOTIFY_SEARCH,
            })

            const tracks = result.tracks
                .filter(
                    (t) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)

            for (const track of tracks) {
                if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                    continue
                const key = normalizeTrackKey(track.title, track.author)
                if (dislikedTrackKeys.has(key)) continue
                const rec = calculateRecommendationScore(
                    track,
                    currentTrack,
                    recentArtists,
                    likedTrackKeys,
                    autoplayMode,
                )
                upsertScoredCandidate(candidates, track, {
                    score: rec.score - 0.1,
                    reason: rec.reason
                        ? `${rec.reason} • artist fallback`
                        : 'artist fallback',
                })
            }

            if (candidates.size > 0) return
        } catch {
            continue
        }
    }
}

function shouldIncludeCandidate(
    track: Track,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
): boolean {
    return !isDuplicateCandidate(track, excludedUrls, excludedKeys)
}

function upsertScoredCandidate(
    candidates: Map<string, ScoredTrack>,
    candidate: Track,
    recommendation: { score: number; reason: string },
): void {
    const normalizedKey = normalizeTrackKey(candidate.title, candidate.author)
    const candidateKey =
        normalizedKey.replaceAll(':', '').length > 4
            ? normalizedKey
            : getTrackKey(candidate)
    const existing = candidates.get(candidateKey)

    if (!existing || recommendation.score > existing.score) {
        candidates.set(candidateKey, {
            track: candidate,
            score: recommendation.score,
            reason: recommendation.reason,
        })
    }
}

async function collectLastFmCandidates(
    queue: GuildQueue,
    requestedBy: User,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedTrackKeys: Set<string>,
    likedTrackKeys: Set<string>,
    currentTrack: Track,
    recentArtists: Set<string>,
    candidates: Map<string, ScoredTrack>,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
): Promise<void> {
    const seedSlice = await consumeLastFmSeedSlice(
        requestedBy.id,
        LASTFM_SEED_COUNT,
    )
    if (seedSlice.length === 0) return

    // Search for each seed via track search
    for (const seed of seedSlice) {
        const query = `${seed.title} ${seed.artist}`.trim()
        const tracks = await searchLastFmQuery(queue, query, requestedBy)
        for (const track of tracks) {
            if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                continue
            const normalizedKey = normalizeTrackKey(track.title, track.author)
            if (dislikedTrackKeys.has(normalizedKey)) continue
            const rec = calculateRecommendationScore(
                track,
                currentTrack,
                recentArtists,
                likedTrackKeys,
                autoplayMode,
            )
            upsertScoredCandidate(candidates, track, {
                score: rec.score + LASTFM_SCORE_BOOST,
                reason: rec.reason
                    ? `${rec.reason} • last.fm taste`
                    : 'last.fm taste',
            })
        }

        // Also search for similar tracks via Last.fm API
        const similar = await getSimilarTracks(seed.artist, seed.title)
        for (const s of similar.slice(0, MAX_SIMILAR_LOOKUPS)) {
            const query = `${s.title} ${s.artist}`.trim()
            const tracks = await searchLastFmQuery(queue, query, requestedBy)
            for (const track of tracks) {
                if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                    continue
                const normalizedKey = normalizeTrackKey(
                    track.title,
                    track.author,
                )
                if (dislikedTrackKeys.has(normalizedKey)) continue
                const rec = calculateRecommendationScore(
                    track,
                    currentTrack,
                    recentArtists,
                    likedTrackKeys,
                    autoplayMode,
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

async function searchLastFmQuery(
    queue: GuildQueue,
    query: string,
    requestedBy: User,
): Promise<Track[]> {
    const engines: QueryType[] = [
        QueryType.SPOTIFY_SEARCH,
        QueryType.YOUTUBE_SEARCH,
        QueryType.AUTO,
    ]
    for (const engine of engines) {
        try {
            const result = await queue.player.search(query, {
                requestedBy,
                searchEngine: engine,
            })
            const tracks = result.tracks
                .filter(
                    (t) =>
                        !t.durationMS ||
                        t.durationMS <= MAX_AUTOPLAY_DURATION_MS,
                )
                .slice(0, SEARCH_RESULTS_LIMIT)
            if (tracks.length > 0) return tracks
        } catch {
            continue
        }
    }
    return []
}

const GENRE_SCORE_BOOST = 0.1
const MAX_GENRES = 3
const MAX_TRACKS_PER_GENRE = 20

async function collectGenreCandidates(
    queue: GuildQueue,
    genres: string[],
    candidates: Map<string, ScoredTrack>,
    recentArtists: Set<string>,
    likedTrackKeys: Set<string>,
    dislikedTrackKeys: Set<string>,
    currentTrack: Track,
    requestedBy: User | null,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
): Promise<void> {
    if (!requestedBy) return
    const modsToUse = genres.slice(0, MAX_GENRES)
    for (const tag of modsToUse) {
        if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        const tracks = await getTagTopTracks(tag, MAX_TRACKS_PER_GENRE)
        for (const seed of tracks) {
            if (candidates.size >= AUTOPLAY_BUFFER_SIZE) break
            const query = `${seed.title} ${seed.artist}`.trim()
            const results = await searchLastFmQuery(
                queue,
                query,
                requestedBy,
            )
            for (const track of results) {
                if (!shouldIncludeCandidate(track, excludedUrls, excludedKeys))
                    continue
                const normalizedKey = normalizeTrackKey(
                    track.title,
                    track.author,
                )
                if (dislikedTrackKeys.has(normalizedKey)) continue
                const rec = calculateRecommendationScore(
                    track,
                    currentTrack,
                    recentArtists,
                    likedTrackKeys,
                    autoplayMode,
                )
                upsertScoredCandidate(candidates, track, {
                    score: rec.score + GENRE_SCORE_BOOST,
                    reason: rec.reason
                        ? `${rec.reason} • ${tag} vibes`
                        : `${tag} vibes`,
                })
            }
        }
    }
}

function selectDiverseCandidates(
    candidates: Map<string, ScoredTrack>,
    missingTracks: number,
    maxPerArtist = MAX_TRACKS_PER_ARTIST,
    maxPerSource = MAX_TRACKS_PER_SOURCE,
): ScoredTrack[] {
    const jitteredCandidates = Array.from(candidates.values()).map((c) => ({
        ...c,
        jitteredScore: c.score + randomJitter(0.02),
    })) as (ScoredTrack & { jitteredScore: number })[]

    const sortedCandidates = jitteredCandidates.sort(
        (a, b) => b.jitteredScore - a.jitteredScore,
    )
    const selected: ScoredTrack[] = []
    const artistCount = new Map<string, number>()
    const sourceCount = new Map<string, number>()
    const selectedTitleKeys = new Set<string>()

    for (const candidate of sortedCandidates) {
        const artistKey = candidate.track.author.toLowerCase()
        const sourceKey = (candidate.track.source ?? 'unknown').toLowerCase()
        const titleKey = normalizeTitleOnly(candidate.track.title)

        if ((artistCount.get(artistKey) ?? 0) >= maxPerArtist) continue
        if ((sourceCount.get(sourceKey) ?? 0) >= maxPerSource) continue
        if (titleKey && selectedTitleKeys.has(titleKey)) continue

        selected.push(candidate)
        artistCount.set(artistKey, (artistCount.get(artistKey) ?? 0) + 1)
        sourceCount.set(sourceKey, (sourceCount.get(sourceKey) ?? 0) + 1)
        if (titleKey) selectedTitleKeys.add(titleKey)
        if (selected.length >= missingTracks) {
            break
        }
    }

    return selected
}

async function addSelectedTracks(
    queue: GuildQueue,
    selected: ScoredTrack[],
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    requestedById?: string,
): Promise<void> {
    const historyWrites: Promise<boolean>[] = []

    for (const candidate of selected) {
        markAsAutoplayTrack(candidate.track, candidate.reason, requestedById)
        queue.addTrack(candidate.track)
        // Update local exclusion sets for this replenish call
        excludedUrls.add(candidate.track.url)
        const vid = extractYouTubeVideoId(candidate.track.url)
        if (vid) excludedUrls.add(vid)
        excludedKeys.add(
            normalizeTrackKey(candidate.track.title, candidate.track.author),
        )
        excludedKeys.add(normalizeTitleOnly(candidate.track.title))
        // Write to Redis immediately so the NEXT replenish call (from the
        // subsequent event) also excludes this track — not just the local set.
        historyWrites.push(
            trackHistoryService.addTrackToHistory(
                {
                    id: candidate.track.id || candidate.track.url,
                    url: candidate.track.url,
                    title: candidate.track.title,
                    author: candidate.track.author,
                    duration: candidate.track.duration ?? '',
                    metadata: { isAutoplay: true },
                },
                queue.guild.id,
            ),
        )
    }

    await Promise.all(historyWrites)
}

function isPlayableTrack(track: Track): boolean {
    return Boolean(track.url) && Boolean(track.title) && Boolean(track.author)
}

async function probeTrackResolvable(
    queue: GuildQueue,
    track: Track,
    timeoutMs: number,
): Promise<boolean> {
    const query = track.url || `${track.title} ${track.author}`.trim()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
        const result = await Promise.race([
            queue.player.search(query, { searchEngine: QueryType.AUTO }),
            new Promise<null>(
                (resolve) =>
                    (timeoutId = setTimeout(() => resolve(null), timeoutMs)),
            ),
        ])
        return result !== null && result.tracks.length > 0
    } catch {
        return false
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
    }
}

export type RescueQueueOptions = {
    probeResolvable?: boolean
    probeTimeoutMs?: number
    refillThreshold?: number
}

export async function rescueQueue(
    queue: GuildQueue,
    opts: RescueQueueOptions = {},
): Promise<QueueRescueResult> {
    const {
        probeResolvable = false,
        probeTimeoutMs = QUEUE_RESCUE_PROBE_TIMEOUT_MS,
        refillThreshold = QUEUE_RESCUE_REFILL_THRESHOLD,
    } = opts

    try {
        const tracks = queue.tracks.toArray()
        const keptTracks: Track[] = []
        let removedTracks = 0

        for (const track of tracks) {
            if (!isPlayableTrack(track)) {
                removedTracks++
                continue
            }
            if (probeResolvable) {
                const resolvable = await probeTrackResolvable(
                    queue,
                    track,
                    probeTimeoutMs,
                )
                if (!resolvable) {
                    removedTracks++
                    continue
                }
            }
            keptTracks.push(track)
        }

        queue.clear()
        for (const track of keptTracks) {
            queue.addTrack(track)
        }

        const beforeReplenish = queue.tracks.size
        if (queue.currentTrack && queue.tracks.size < refillThreshold) {
            await replenishQueue(queue)
        }
        const addedTracks = Math.max(0, queue.tracks.size - beforeReplenish)

        return {
            removedTracks,
            keptTracks: keptTracks.length,
            addedTracks,
        }
    } catch (error) {
        errorLog({ message: 'Error rescuing queue:', error })
        return {
            removedTracks: 0,
            keptTracks: queue.tracks.size,
            addedTracks: 0,
        }
    }
}

function getHistoryTracks(queue: GuildQueue): Track[] {
    const history = queue.history as
        | { tracks?: { toArray?: () => Track[]; data?: Track[] } }
        | undefined

    if (!history?.tracks) return []
    if (typeof history.tracks.toArray === 'function')
        return history.tracks.toArray().slice(0, HISTORY_SEED_LIMIT)
    if (Array.isArray(history.tracks.data))
        return history.tracks.data.slice(0, HISTORY_SEED_LIMIT)

    return []
}

function normalizeTrackKey(title?: string, author?: string): string {
    const cleanedTitle = title ? cleanTitle(title) : ''
    const cleanedAuthor = author ? cleanAuthor(author) : ''
    return `${normalizeText(cleanedTitle)}::${normalizeText(cleanedAuthor)}`
}

function normalizeTitleOnly(title?: string): string {
    return normalizeText(title ? cleanTitle(title) : '')
}

function normalizeText(value?: string): string {
    return (value ?? '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
}

function getTrackKey(track: Track): string {
    return track.id || track.url || normalizeTrackKey(track.title, track.author)
}

function isDuplicateCandidate(
    track: Track,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
): boolean {
    if (track.url) {
        if (excludedUrls.has(track.url)) return true
        const vid = extractYouTubeVideoId(track.url)
        if (vid && excludedUrls.has(vid)) return true
    }
    if (excludedKeys.has(normalizeTrackKey(track.title, track.author)))
        return true
    return excludedKeys.has(normalizeTitleOnly(track.title))
}

function calculateRecommendationScore(
    candidate: Track,
    currentTrack: Track,
    recentArtists: Set<string>,
    likedTrackKeys: Set<string> = new Set(),
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
): { score: number; reason: string } {
    let score = 1
    const reasons: string[] = []
    const currentArtist = currentTrack.author.toLowerCase()
    const candidateArtist = candidate.author.toLowerCase()

    const candidateKey = normalizeTrackKey(candidate.title, candidate.author)
    if (likedTrackKeys.has(candidateKey)) {
        score += 0.3
        reasons.push('liked track')
    }

    if (candidateArtist === currentArtist) {
        score -= 0.35
    } else if (!recentArtists.has(candidateArtist)) {
        score += 0.15
        reasons.push('session novelty')
    } else {
        reasons.push('fresh artist rotation')
    }
    if (recentArtists.has(candidateArtist)) {
        score -= 0.25
    }
    if (candidate.source === currentTrack.source) {
        score -= 0.25
    } else if (candidate.source) {
        reasons.push('source variety')
    }
    const tokenScore = sharedTitleTokenScore(
        candidate.title,
        currentTrack.title,
    )
    score += tokenScore
    if (tokenScore > 0) {
        reasons.push('similar title mood')
    }
    if (
        currentTrack.durationMS &&
        candidate.durationMS &&
        currentTrack.durationMS > 0
    ) {
        const ratio = candidate.durationMS / currentTrack.durationMS
        if (ratio >= 0.8 && ratio <= 1.2) {
            score += 0.15
            reasons.push('similar energy')
        } else if (ratio >= 0.7 && ratio <= 1.3) {
            score += 0.05
        }
    }

    if (candidate.durationMS && candidate.durationMS > 7 * 60 * 1000) {
        score -= 0.2
        reasons.push('long track penalty')
    }

    // Mode-specific adjustments
    if (autoplayMode === 'discover') {
        // Boost novelty — prefer artists not heard recently
        if (!recentArtists.has(candidateArtist)) {
            score += 0.25
            reasons.push('discovery boost')
        }
        if (recentArtists.has(candidateArtist)) {
            score -= 0.2 // extra penalty on top of existing -0.25
        }
    } else if (autoplayMode === 'popular') {
        // Boost liked tracks more and high-energy/shorter tracks
        if (likedTrackKeys.has(candidateKey)) {
            score += 0.2 // on top of existing +0.3
        }
        // Prefer similar-length (same energy feel)
        if (candidate.durationMS && currentTrack.durationMS) {
            const ratio = candidate.durationMS / currentTrack.durationMS
            if (ratio >= 0.9 && ratio <= 1.1) {
                score += 0.1
                reasons.push('energy match')
            }
        }
    }

    return {
        score,
        reason:
            reasons.length > 0 ? reasons.join(' • ') : 'balanced autoplay pick',
    }
}

function sharedTitleTokenScore(titleA: string, titleB: string): number {
    const tokensA = new Set(splitTokens(titleA))
    const tokensB = splitTokens(titleB)
    if (tokensA.size === 0 || tokensB.length === 0) return 0

    let matches = 0
    for (const token of tokensB) {
        if (tokensA.has(token)) matches++
    }

    return Math.min(0.2, matches * 0.05)
}

function splitTokens(value: string): string[] {
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2)
}

function markAsAutoplayTrack(
    track: Track,
    recommendationReason: string,
    requestedById?: string,
): void {
    const descriptor = Object.getOwnPropertyDescriptor(track, 'metadata')

    if (descriptor?.configurable === false) {
        // discord-player seals metadata as a non-configurable property on some
        // track objects — Object.defineProperty would throw `Cannot redefine`.
        // Mutate the object the getter/value returns directly (stable reference).
        const meta = (
            track as unknown as { metadata?: Record<string, unknown> }
        ).metadata
        if (meta && typeof meta === 'object' && !Object.isFrozen(meta)) {
            meta['isAutoplay'] = true
            meta['recommendationReason'] = recommendationReason
            if (requestedById !== undefined)
                meta['requestedById'] = requestedById
        }
        return
    }

    const existingMetadata =
        (track as unknown as { metadata?: Record<string, unknown> }).metadata ??
        {}
    const existingRequestedById =
        typeof existingMetadata.requestedById === 'string'
            ? existingMetadata.requestedById
            : undefined

    Object.defineProperty(track, 'metadata', {
        value: {
            ...existingMetadata,
            isAutoplay: true,
            recommendationReason,
            requestedById: requestedById ?? existingRequestedById,
        },
        writable: true,
        configurable: true,
        enumerable: true,
    })
}

export function moveUserTrackToPriority(queue: GuildQueue, track: Track): void {
    const tracks = queue.tracks.toArray()
    const trackIndex = tracks.findIndex((t) => t.url === track.url)

    if (trackIndex === -1) {
        debugLog({
            message: 'User track not in queue (already playing)',
            data: { title: track.title },
        })
        return
    }

    const firstAutoplayIndex = tracks.findIndex((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (firstAutoplayIndex === -1 || trackIndex < firstAutoplayIndex) {
        return
    }

    try {
        queue.node.remove(track)
    } catch {
        return
    }

    const remaining = queue.tracks.toArray()
    const newFirstAutoplayIndex = remaining.findIndex((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (newFirstAutoplayIndex === -1) {
        queue.addTrack(track)
    } else {
        queue.insertTrack(track, newFirstAutoplayIndex)
    }

    debugLog({
        message: 'User track moved to priority position',
        data: {
            title: track.title,
            insertAt:
                newFirstAutoplayIndex === -1 ? 'end' : newFirstAutoplayIndex,
        },
    })
}

export async function blendAutoplayTracks(
    queue: GuildQueue,
    _newSeedTrack: Track,
    blendRatio = 0.5,
): Promise<void> {
    const tracks = queue.tracks.toArray()
    const autoplayTracks = tracks.filter((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (autoplayTracks.length === 0) return

    const keepCount = Math.ceil(autoplayTracks.length * blendRatio)
    const toRemove = autoplayTracks.slice(keepCount)

    for (const track of toRemove) {
        try {
            queue.node.remove(track)
        } catch {
            // Track may already be removed
        }
    }

    debugLog({
        message: 'Autoplay tracks blended',
        data: {
            kept: keepCount,
            removed: toRemove.length,
        },
    })

    await replenishQueue(queue)
}
