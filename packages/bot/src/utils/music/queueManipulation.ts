import {
    QueryType,
    QueueRepeatMode,
    type Track,
    type GuildQueue,
} from 'discord-player'
import { randomInt } from 'node:crypto'
import type { User } from 'discord.js'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { recommendationFeedbackService } from '../../services/musicRecommendation/feedbackService'

const AUTOPLAY_BUFFER_SIZE = 8
const HISTORY_SEED_LIMIT = 3
const SEARCH_RESULTS_LIMIT = 8
const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
const MAX_LIKED_TRACK_SHARE = 0.5
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
    isLiked: boolean
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

export async function replenishQueue(queue: GuildQueue): Promise<void> {
    try {
        debugLog({
            message: 'Replenishing queue',
            data: { guildId: queue.guild.id, queueSize: queue.tracks.size },
        })

        const currentTrack = queue.currentTrack
        if (!currentTrack) return

        const missingTracks = AUTOPLAY_BUFFER_SIZE - queue.tracks.size
        if (missingTracks <= 0) return

        const historyTracks = getHistoryTracks(queue)
        const seedTracks = [currentTrack, ...historyTracks].slice(
            0,
            HISTORY_SEED_LIMIT + 1,
        )
        const requestedBy = getRequestedBy(queue, currentTrack)
        const [dislikedTrackKeys, likedTrackKeys] = await Promise.all([
            recommendationFeedbackService.getDislikedTrackKeys(
                queue.guild.id,
                requestedBy?.id,
            ),
            recommendationFeedbackService.getLikedTrackKeys(
                queue.guild.id,
                requestedBy?.id,
            ),
        ])
        const excludedUrls = buildExcludedUrls(
            queue,
            currentTrack,
            historyTracks,
        )
        const excludedKeys = buildExcludedKeys(
            queue,
            currentTrack,
            historyTracks,
        )
        const recentArtists = buildRecentArtists(currentTrack, historyTracks)
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
        )
        const selected = selectDiverseCandidates(candidates, missingTracks)

        addSelectedTracks(
            queue,
            selected,
            excludedUrls,
            excludedKeys,
            requestedBy?.id,
        )

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
    const metadata = queue.metadata as { requestedBy?: User | null }
    return currentTrack.requestedBy ?? metadata?.requestedBy ?? null
}

function buildExcludedUrls(
    queue: GuildQueue,
    currentTrack: Track,
    historyTracks: Track[],
): Set<string> {
    return new Set<string>([
        currentTrack.url,
        ...historyTracks.map((track) => track.url),
        ...queue.tracks.toArray().map((track) => track.url),
    ])
}

function buildExcludedKeys(
    queue: GuildQueue,
    currentTrack: Track,
    historyTracks: Track[],
): Set<string> {
    return new Set<string>([
        normalizeTrackKey(currentTrack.title, currentTrack.author),
        ...historyTracks.map((track) =>
            normalizeTrackKey(track.title, track.author),
        ),
        ...queue.tracks
            .toArray()
            .map((track) => normalizeTrackKey(track.title, track.author)),
    ])
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
): Promise<Map<string, ScoredTrack>> {
    const candidates = new Map<string, ScoredTrack>()

    for (const seed of seedTracks) {
        const seedCandidates = await searchSeedCandidates(
            queue,
            seed,
            requestedBy,
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
                ),
            )
        }
    }

    return candidates
}

async function searchSeedCandidates(
    queue: GuildQueue,
    seed: Track,
    requestedBy: User | null,
): Promise<Track[]> {
    const query = `${seed.title} ${seed.author}`.trim()
    const engines: QueryType[] = [QueryType.AUTO, QueryType.YOUTUBE_SEARCH]

    for (const engine of engines) {
        try {
            const searchResult = await queue.player.search(query, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: engine,
            })

            if (searchResult.tracks.length > 0) {
                return searchResult.tracks.slice(0, SEARCH_RESULTS_LIMIT)
            }
        } catch (error) {
            debugLog({
                message: 'Search failed for seed, trying next engine',
                data: { query, engine, error: String(error) },
            })
        }
    }

    return []
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
    recommendation: { score: number; reason: string; isLiked: boolean },
): void {
    const candidateKey = getTrackKey(candidate)
    const existing = candidates.get(candidateKey)

    if (!existing || recommendation.score > existing.score) {
        candidates.set(candidateKey, {
            track: candidate,
            score: recommendation.score,
            reason: recommendation.reason,
            isLiked: recommendation.isLiked,
        })
    }
}

function selectDiverseCandidates(
    candidates: Map<string, ScoredTrack>,
    missingTracks: number,
    maxPerArtist = MAX_TRACKS_PER_ARTIST,
    maxPerSource = MAX_TRACKS_PER_SOURCE,
    maxLikedShare = MAX_LIKED_TRACK_SHARE,
): ScoredTrack[] {
    const sortedCandidates = Array.from(candidates.values()).sort(
        (a, b) => b.score - a.score,
    )
    const selected: ScoredTrack[] = []
    const artistCount = new Map<string, number>()
    const sourceCount = new Map<string, number>()
    const selectedKeys = new Set<string>()
    const likedCap = Math.max(1, Math.ceil(missingTracks * maxLikedShare))
    let likedSelected = 0

    const canAddCandidate = (candidate: ScoredTrack): boolean => {
        const artistKey = candidate.track.author.toLowerCase()
        const sourceKey = (candidate.track.source ?? 'unknown').toLowerCase()

        if ((artistCount.get(artistKey) ?? 0) >= maxPerArtist) return false
        if ((sourceCount.get(sourceKey) ?? 0) >= maxPerSource) return false

        return true
    }

    const addCandidate = (candidate: ScoredTrack): void => {
        const artistKey = candidate.track.author.toLowerCase()
        const sourceKey = (candidate.track.source ?? 'unknown').toLowerCase()

        selected.push(candidate)
        selectedKeys.add(getTrackKey(candidate.track))
        artistCount.set(artistKey, (artistCount.get(artistKey) ?? 0) + 1)
        sourceCount.set(sourceKey, (sourceCount.get(sourceKey) ?? 0) + 1)

        if (candidate.isLiked) {
            likedSelected++
        }
    }

    for (const candidate of sortedCandidates) {
        if (!canAddCandidate(candidate)) continue
        if (candidate.isLiked && likedSelected >= likedCap) continue

        addCandidate(candidate)
        if (selected.length >= missingTracks) {
            break
        }
    }

    if (selected.length >= missingTracks) {
        return selected
    }

    for (const candidate of sortedCandidates) {
        if (selectedKeys.has(getTrackKey(candidate.track))) continue
        if (!canAddCandidate(candidate)) continue

        addCandidate(candidate)
        if (selected.length >= missingTracks) {
            break
        }
    }

    return selected
}

function addSelectedTracks(
    queue: GuildQueue,
    selected: ScoredTrack[],
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
    requestedById?: string,
): void {
    for (const candidate of selected) {
        markAsAutoplayTrack(candidate.track, candidate.reason, requestedById)
        queue.addTrack(candidate.track)
        excludedUrls.add(candidate.track.url)
        excludedKeys.add(
            normalizeTrackKey(candidate.track.title, candidate.track.author),
        )
    }
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
    try {
        const result = await Promise.race([
            queue.player.search(query, { searchEngine: QueryType.AUTO }),
            new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), timeoutMs),
            ),
        ])
        return result !== null && result.tracks.length > 0
    } catch {
        return false
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
    return `${normalizeText(title)}::${normalizeText(author)}`
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
    if (!track.url) return true
    if (excludedUrls.has(track.url)) return true

    const key = normalizeTrackKey(track.title, track.author)
    return excludedKeys.has(key)
}

function calculateRecommendationScore(
    candidate: Track,
    currentTrack: Track,
    recentArtists: Set<string>,
    likedTrackKeys: Set<string> = new Set(),
): { score: number; reason: string; isLiked: boolean } {
    let score = 1
    const reasons: string[] = []
    const currentArtist = currentTrack.author.toLowerCase()
    const candidateArtist = candidate.author.toLowerCase()
    let isLiked = false

    const candidateKey = normalizeTrackKey(candidate.title, candidate.author)
    if (likedTrackKeys.has(candidateKey)) {
        score += 0.3
        reasons.push('liked track')
        isLiked = true
    }

    if (candidateArtist === currentArtist) {
        score -= 0.35
    } else {
        reasons.push('fresh artist rotation')
    }
    if (recentArtists.has(candidateArtist)) {
        score -= 0.25
    } else {
        reasons.push('new in session')
    }
    if (candidate.source === currentTrack.source) {
        score -= 0.15
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
    const durationScore = getDurationSimilarityScore(candidate, currentTrack)
    score += durationScore
    if (durationScore > 0) {
        reasons.push('similar track length')
    }

    return {
        score,
        reason:
            reasons.length > 0 ? reasons.join(' • ') : 'balanced autoplay pick',
        isLiked,
    }
}

function getDurationSimilarityScore(candidate: Track, currentTrack: Track): number {
    if (typeof candidate.durationMS !== 'number') return 0
    if (typeof currentTrack.durationMS !== 'number') return 0

    const difference = Math.abs(candidate.durationMS - currentTrack.durationMS)
    if (difference > 30_000) return 0

    return 0.08
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
    const trackWithMetadata = track as unknown as {
        metadata?: Record<string, unknown>
    }
    const metadata = trackWithMetadata.metadata ?? {}
    const existingRequestedById =
        typeof metadata.requestedById === 'string'
            ? metadata.requestedById
            : undefined

    trackWithMetadata.metadata = {
        ...metadata,
        isAutoplay: true,
        recommendationReason,
        requestedById: requestedById ?? existingRequestedById,
    }
}

export function insertUserTrackWithPriority(
    queue: GuildQueue,
    track: Track,
): void {
    const tracks = queue.tracks.toArray()
    const firstAutoplayIndex = tracks.findIndex((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (firstAutoplayIndex === -1) {
        queue.addTrack(track)
    } else {
        queue.insertTrack(track, firstAutoplayIndex)
    }

    debugLog({
        message: 'User track inserted with priority',
        data: {
            title: track.title,
            position:
                firstAutoplayIndex === -1 ? tracks.length : firstAutoplayIndex,
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
