import {
    QueryType,
    QueueRepeatMode,
    type Track,
    type GuildQueue,
} from 'discord-player'
import { randomInt } from 'node:crypto'
import type { User } from 'discord.js'
import { LRUCache } from 'lru-cache'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'
import {
    trackHistoryService,
    guildSettingsService,
    lastFmLinkService,
    spotifyLinkService,
} from '@lucky/shared/services'
import {
    getAudioFeatures,
    searchSpotifyTrack,
    getBatchAudioFeatures,
    getArtistPopularity,
    getArtistGenres,
    getSpotifyRecommendations,
    type SpotifyAudioFeatures,
} from '../../spotify/spotifyApi'
import {
    consumeLastFmSeedSlice,
    consumeBlendedSeedSlice,
} from './autoplay/lastFmSeeds'
import { detectSessionMood, type SessionMood } from './autoplay/sessionMood'
import {
    collectSpotifyRecommendationCandidates,
    searchSeedCandidates,
} from './autoplay/spotifyRecommender'
import {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './autoplay/candidateCollector'
import {
    buildExcludedUrls,
    buildExcludedKeys,
    isDuplicateCandidate,
    selectDiverseCandidates,
    addSelectedTracks,
    purgeDuplicatesOfCurrentTrack,
} from './autoplay/diversitySelector'
import { collectLastFmCandidates, searchLastFmQuery } from './autoplay/lastFmSeeder'
import { getSimilarTracks, getTagTopTracks } from '../../lastfm'
export { collectLastFmCandidates }
import {
    cleanSearchQuery,
    cleanTitle,
    cleanAuthor,
    extractSongCore,
} from './searchQueryCleaner'
import { calculateStringSimilarity } from './duplicateDetection/similarityChecker'
import type { QueueMetadata } from '../../types/QueueMetadata'
import { replenishQueue } from './autoplay/replenisher'

export { replenishQueue }

const AUTOPLAY_BUFFER_SIZE = 8
const HISTORY_SEED_LIMIT = 3
const SEARCH_RESULTS_LIMIT = 8
const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
const LASTFM_SEED_COUNT = 3
const LASTFM_SCORE_BOOST = 0.0
const MAX_SIMILAR_LOOKUPS = 5
const QUEUE_RESCUE_PROBE_TIMEOUT_MS = Number.parseInt(
    process.env.QUEUE_RESCUE_PROBE_TIMEOUT_MS ?? '5000',
    10,
)
const QUEUE_RESCUE_REFILL_THRESHOLD = Number.parseInt(
    process.env.QUEUE_RESCUE_REFILL_THRESHOLD ?? '3',
    10,
)

interface AudioFeatureEntry {
    value: SpotifyAudioFeatures | null
}

const audioFeatureCache = new LRUCache<string, AudioFeatureEntry>({
    max: 5000,
    ttl: 24 * 60 * 60 * 1000,
})

export async function getTrackAudioFeatures(
    track: Track,
    userId: string,
): Promise<SpotifyAudioFeatures | null> {
    const cacheKey = normalizeTrackKey(track.title, track.author)

    const cached = audioFeatureCache.get(cacheKey)
    if (cached !== undefined) {
        debugLog({
            message: 'Audio feature cache hit',
            data: { cacheKey, hasValue: cached.value !== null },
        })
        return cached.value
    }

    debugLog({
        message: 'Audio feature cache miss',
        data: { cacheKey, cacheSize: audioFeatureCache.size },
    })

    const token = await spotifyLinkService.getValidAccessToken(userId)
    if (!token) {
        audioFeatureCache.set(cacheKey, { value: null })
        return null
    }

    let spotifyId: string | null = null

    if (track.url && track.url.includes('open.spotify.com/track/')) {
        const match = track.url.match(/track\/([a-zA-Z0-9]+)/)
        if (match) {
            spotifyId = match[1]
        }
    }

    if (!spotifyId) {
        spotifyId = await searchSpotifyTrack(
            token,
            cleanTitle(track.title ?? ''),
            cleanAuthor(track.author ?? ''),
        )
    }

    if (!spotifyId) {
        audioFeatureCache.set(cacheKey, { value: null })
        return null
    }

    const features = await getAudioFeatures(token, spotifyId).catch(() => null)
    audioFeatureCache.set(cacheKey, { value: features })
    return features
}

export type QueueRescueResult = {
    removedTracks: number
    keptTracks: number
    addedTracks: number
}

// Re-export from candidateCollector for backward compatibility
export {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
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


function randomIndex(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0
    return randomInt(maxExclusive)
}

function randomJitter(max: number): number {
    if (max <= 0) return 0
    return (randomInt(10_000) / 10_000) * max
}

export function extractSpotifyTrackId(track: Track): string | null {
    const match =
        track.url?.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/) ??
        track.url?.match(/^spotify:track:([A-Za-z0-9]+)/)
    return match?.[1] ?? null
}



const MAX_AUTOPLAY_DURATION_MS = 10 * 60 * 1000


export async function collectBroadFallbackCandidates(
    queue: GuildQueue,
    currentTrack: Track,
    requestedBy: User | null,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    dislikedWeights: Map<string, number>,
    likedWeights: Map<string, number>,
    preferredArtistKeys: Set<string>,
    blockedArtistKeys: Set<string>,
    recentArtists: Set<string>,
    candidates: Map<string, ScoredTrack>,
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    sessionMood: SessionMood | null = null,
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
                const dislikedWeight = dislikedWeights.get(key)
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
                    sessionMood,
                )
                if (rec.score === -Infinity) continue
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



const GENRE_SCORE_BOOST = 0.1
const MAX_GENRES = 3
const MAX_TRACKS_PER_GENRE = 20

interface CandidateContext {
    candidates: Map<string, ScoredTrack>
    recentArtists: Set<string>
    likedTrackKeys: Map<string, number>
    dislikedTrackKeys: Map<string, number>
    currentTrack: Track
    excludedUrls: Set<string>
    excludedKeys: Set<string>
    preferredArtistKeys: Set<string>
    blockedArtistKeys: Set<string>
    autoplayMode: 'similar' | 'discover' | 'popular'
    artistFrequency?: Map<string, number>
    implicitDislikeKeys?: Set<string>
    implicitLikeKeys?: Set<string>
    sessionMood?: SessionMood | null
}

function addGenreTrackCandidate(
    track: Track,
    tag: string,
    ctx: CandidateContext,
): void {
    if (!shouldIncludeCandidate(track, ctx.excludedUrls, ctx.excludedKeys))
        return
    const key = normalizeTrackKey(track.title, track.author)
    const dislikedWeight = ctx.dislikedTrackKeys.get(key)
    if (dislikedWeight !== undefined && dislikedWeight > 0.5) return
    const rec = calculateRecommendationScore(
        track,
        ctx.currentTrack,
        ctx.recentArtists,
        ctx.likedTrackKeys,
        ctx.preferredArtistKeys,
        ctx.blockedArtistKeys,
        ctx.autoplayMode,
        ctx.artistFrequency,
        ctx.implicitDislikeKeys,
        ctx.implicitLikeKeys,
        ctx.dislikedTrackKeys,
        ctx.sessionMood,
    )
    if (rec.score === -Infinity) return
    upsertScoredCandidate(ctx.candidates, track, {
        score: rec.score + GENRE_SCORE_BOOST,
        reason: rec.reason ? `${rec.reason} • ${tag} vibes` : `${tag} vibes`,
    })
}

export async function collectGenreCandidates(
    queue: GuildQueue,
    genres: string[],
    requestedBy: User,
    ctx: CandidateContext,
): Promise<void> {
    for (const tag of genres.slice(0, MAX_GENRES)) {
        if (ctx.candidates.size >= AUTOPLAY_BUFFER_SIZE) break
        const seeds = await getTagTopTracks(tag, MAX_TRACKS_PER_GENRE)
        for (const seed of seeds) {
            if (ctx.candidates.size >= AUTOPLAY_BUFFER_SIZE) break
            const results = await searchLastFmQuery(
                queue,
                cleanSearchQuery(seed.title, seed.artist),
                requestedBy,
            )
            for (const track of results) addGenreTrackCandidate(track, tag, ctx)
        }
    }
}

export async function enrichWithAudioFeatures(
    tracks: ScoredTrack[],
    userId: string,
    currentFeatures: SpotifyAudioFeatures | null,
    currentArtistName?: string,
): Promise<ScoredTrack[]> {
    if (!currentFeatures || !userId) return tracks

    const token = await Promise.resolve(
        spotifyLinkService.getValidAccessToken(userId),
    ).catch(() => null)
    if (!token) return tracks

    const spotifyIds: string[] = []
    const idToTrack = new Map<string, ScoredTrack>()

    for (const track of tracks) {
        if (track.track.url?.includes('open.spotify.com/track/')) {
            const match = track.track.url.match(/track\/([a-zA-Z0-9]+)/)
            if (match?.[1]) {
                spotifyIds.push(match[1])
                idToTrack.set(match[1], track)
            }
        }
    }

    if (spotifyIds.length === 0) return tracks

    const features = await getBatchAudioFeatures(token, spotifyIds).catch(
        () => new Map(),
    )

    let currentGenres: string[] = []
    if (currentArtistName) {
        currentGenres = await getArtistGenres(token, currentArtistName).catch(
            () => [],
        )
    }

    for (const [id, feature] of features) {
        const track = idToTrack.get(id)
        if (!track) continue

        const energyDelta = Math.abs(feature.energy - currentFeatures.energy)
        const valenceDelta = Math.abs(feature.valence - currentFeatures.valence)

        if (energyDelta < 0.15 && valenceDelta < 0.2) {
            track.score += 0.15
        } else if (energyDelta < 0.3 || valenceDelta < 0.35) {
            track.score += 0.07
        } else if (energyDelta > 0.6) {
            track.score -= 0.1
        }

        if (currentGenres.length > 0) {
            const candidateGenres = await getArtistGenres(
                token,
                track.track.author,
            ).catch(() => [])
            const genrePenalty = calculateGenreFamilyPenalty(
                currentGenres,
                candidateGenres,
            )
            if (genrePenalty !== 0) {
                track.score += genrePenalty
                if (genrePenalty < -0.3) {
                    track.reason += ' • genre family drift'
                }
            }
        }
    }

    return tracks.sort((a, b) => b.score - a.score)
}

export function interleaveByArtist(tracks: ScoredTrack[]): ScoredTrack[] {
    const groups = new Map<string, ScoredTrack[]>()
    for (const t of tracks) {
        const key = cleanAuthor(t.track.author).toLowerCase()
        const group = groups.get(key) ?? []
        group.push(t)
        groups.set(key, group)
    }
    const result: ScoredTrack[] = []
    let added = true
    let round = 0
    while (added) {
        added = false
        for (const group of groups.values()) {
            if (round < group.length) {
                result.push(group[round]!)
                added = true
            }
        }
        round++
    }
    return result
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

function getAllHistoryTracks(queue: GuildQueue): Track[] {
    const history = queue.history as
        | { tracks?: { toArray?: () => Track[]; data?: Track[] } }
        | undefined

    if (!history?.tracks) return []
    if (typeof history.tracks.toArray === 'function')
        return history.tracks.toArray()
    if (Array.isArray(history.tracks.data)) return history.tracks.data
    return []
}

function getHistoryTracks(queue: GuildQueue): Track[] {
    return getAllHistoryTracks(queue).slice(0, HISTORY_SEED_LIMIT)
}

export function buildVcContributionWeights(
    historyTracks: { requestedBy?: { id?: string } | null }[],
    vcMemberIds: string[],
): Map<string, number> {
    const contributions = new Map<string, number>()

    for (const memberId of vcMemberIds) {
        const count = historyTracks.filter(
            (t) => t.requestedBy?.id === memberId,
        ).length
        contributions.set(memberId, count > 0 ? count : 1)
    }

    const totalWeight = Array.from(contributions.values()).reduce(
        (sum, w) => sum + w,
        0,
    )
    const scaleFactor = vcMemberIds.length / totalWeight

    const weights = new Map<string, number>()
    for (const [memberId, count] of contributions) {
        weights.set(memberId, count * scaleFactor)
    }

    return weights
}

function stripFeaturing(author: string): string {
    const lower = author.toLowerCase()
    for (const kw of [' feat ', ' ft ', ' con ', ' with ']) {
        const idx = lower.indexOf(kw)
        if (idx >= 0) return author.slice(0, idx)
    }
    return author
}

export function normalizeTrackKey(title?: string, author?: string): string {
    const cleanedTitle = title ? cleanTitle(title) : ''
    const primaryAuthor = author
        ? stripFeaturing(cleanAuthor(author).split(',')[0] ?? '').trim()
        : ''
    return `${normalizeText(cleanedTitle)}::${normalizeText(primaryAuthor)}`
}

function normalizeTitleOnly(title?: string): string {
    return normalizeText(title ? cleanTitle(title) : '')
}

export function normalizeText(value?: string): string {
    return (value ?? '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
}

function getTrackKey(track: Track): string {
    return track.id || track.url || normalizeTrackKey(track.title, track.author)
}

const FUZZY_TITLE_THRESHOLD = 0.82

const GENRE_FAMILIES = {
    rap_hiphop: ['hip hop', 'rap', 'trap', 'drill', 'gangster rap', 'g-funk'],
    rnb_soul: ['r&b', 'soul', 'neo soul'],
    electronic: [
        'edm',
        'house',
        'techno',
        'trance',
        'dubstep',
        'drum and bass',
        'electro',
        'synthwave',
    ],
    rock_metal: ['rock', 'metal', 'punk', 'grunge', 'alternative'],
    pop: ['pop', 'dance pop', 'latin pop', 'k-pop', 'indie pop'],
    latin: [
        'reggaeton',
        'forró',
        'samba',
        'bossa nova',
        'latin trap',
        'trap latino',
    ],
    country_folk: ['country', 'folk', 'bluegrass'],
    jazz_classical: ['jazz', 'classical', 'orchestral'],
    world: ['afrobeat', 'desi', 'bhangra'],
    ambient_chill: ['lofi', 'chillwave', 'downtempo', 'ambient'],
}

export function getGenreFamilies(genres: string[]): Set<string> {
    const families = new Set<string>()
    const lowerGenres = genres.map((g) => g.toLowerCase())

    for (const [family, keywords] of Object.entries(GENRE_FAMILIES)) {
        for (const keyword of keywords) {
            if (lowerGenres.some((g) => g.includes(keyword))) {
                families.add(family)
                break
            }
        }
    }

    return families
}

export function calculateGenreFamilyPenalty(
    currentGenres: string[],
    candidateGenres: string[],
): number {
    const currentFamilies = getGenreFamilies(currentGenres)
    const candidateFamilies = getGenreFamilies(candidateGenres)

    if (currentFamilies.size === 0 || candidateFamilies.size === 0) {
        return -0.1
    }

    for (const family of currentFamilies) {
        if (candidateFamilies.has(family)) {
            return 0
        }
    }

    const strongGenres = ['rap_hiphop', 'rock_metal', 'latin']
    const isStrongGenre = Array.from(currentFamilies).some((f) =>
        strongGenres.includes(f),
    )

    return isStrongGenre ? -0.6 : -0.3
}

// `calculateRecommendationScore` previously had a stale duplicate copy here
// (predating the autoplay/candidateScorer.ts canonicalisation). Internal
// callers (collectBroadFallbackCandidates, addGenreTrackCandidate) and
// external imports now both pick up the canonical version with the
// cross-locale and cross-genre vetos.
import { calculateRecommendationScore } from './autoplay/candidateScorer'
export { calculateRecommendationScore }

export function markAsAutoplayTrack(
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
