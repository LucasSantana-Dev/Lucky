import { QueryType, type Track, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog, errorLog } from '@lucky/shared/utils'

const AUTOPLAY_BUFFER_SIZE = 4
const HISTORY_SEED_LIMIT = 3
const SEARCH_RESULTS_LIMIT = 8

type ScoredTrack = {
    track: Track
    score: number
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
            const j = Math.floor(Math.random() * (i + 1))
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

        const metadata = queue.metadata as { requestedBy?: User | null }
        const requestedBy = currentTrack.requestedBy ?? metadata?.requestedBy
        const historyTracks = getHistoryTracks(queue)
        const seeds = [currentTrack, ...historyTracks].slice(
            0,
            HISTORY_SEED_LIMIT + 1,
        )
        const excludedUrls = new Set<string>([
            currentTrack.url,
            ...historyTracks.map((track) => track.url),
            ...queue.tracks.toArray().map((track) => track.url),
        ])
        const excludedKeys = new Set<string>([
            normalizeTrackKey(currentTrack.title, currentTrack.author),
            ...historyTracks.map((track) =>
                normalizeTrackKey(track.title, track.author),
            ),
            ...queue.tracks
                .toArray()
                .map((track) => normalizeTrackKey(track.title, track.author)),
        ])
        const recentArtists = new Set<string>(
            [currentTrack.author, ...historyTracks.map((track) => track.author)]
                .filter(Boolean)
                .map((artist) => artist.toLowerCase()),
        )

        const candidates = new Map<string, ScoredTrack>()

        for (const seed of seeds) {
            const query = `${seed.title} ${seed.author}`.trim()
            const searchResult = await queue.player.search(query, {
                requestedBy: requestedBy ?? undefined,
                searchEngine: QueryType.AUTO,
            })
            for (const candidate of searchResult.tracks.slice(
                0,
                SEARCH_RESULTS_LIMIT,
            )) {
                if (isDuplicateCandidate(candidate, excludedUrls, excludedKeys))
                    continue

                const candidateKey = getTrackKey(candidate)
                const score = calculateRecommendationScore(
                    candidate,
                    currentTrack,
                    recentArtists,
                )
                const existing = candidates.get(candidateKey)
                if (!existing || score > existing.score) {
                    candidates.set(candidateKey, { track: candidate, score })
                }
            }
        }

        const selected = Array.from(candidates.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, missingTracks)

        for (const candidate of selected) {
            markAsAutoplayTrack(candidate.track)
            queue.addTrack(candidate.track)
            excludedUrls.add(candidate.track.url)
            excludedKeys.add(
                normalizeTrackKey(
                    candidate.track.title,
                    candidate.track.author,
                ),
            )
        }

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
): number {
    let score = 1
    const currentArtist = currentTrack.author.toLowerCase()
    const candidateArtist = candidate.author.toLowerCase()

    if (candidateArtist === currentArtist) score -= 0.35
    if (recentArtists.has(candidateArtist)) score -= 0.25
    if (candidate.source === currentTrack.source) score += 0.1
    score += sharedTitleTokenScore(candidate.title, currentTrack.title)

    return score
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

function markAsAutoplayTrack(track: Track): void {
    const trackWithMetadata = track as unknown as {
        metadata?: Record<string, unknown>
    }
    const metadata = trackWithMetadata.metadata ?? {}

    trackWithMetadata.metadata = {
        ...metadata,
        isAutoplay: true,
    }
}
