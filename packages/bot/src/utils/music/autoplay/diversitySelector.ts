import type { Track, GuildQueue } from 'discord-player'
import { debugLog } from '@lucky/shared/utils'
import { trackHistoryService } from '@lucky/shared/services'
import { extractSongCore, cleanTitle, cleanAuthor } from '../searchQueryCleaner'
import { calculateStringSimilarity } from '../duplicateDetection/similarityChecker'
import { markAsAutoplayTrack } from '../queueManipulation'

interface ScoredTrack {
    track: Track
    score: number
    reason: string
}

const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
const FUZZY_TITLE_THRESHOLD = 0.82

function randomJitter(max: number): number {
    return Math.random() * max
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

function normalizeTitleOnly(title?: string): string {
    return normalizeText(title ? cleanTitle(title) : '')
}

function stripFeaturing(author: string): string {
    return author
        .split(/\s+(?:feat|ft)\.?(?:\s|$)/i)[0]
        .replace(/\s*\([^)]*feat[^)]*\)\s*/gi, '')
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

export function buildExcludedUrls(
    queue: GuildQueue,
    currentTrack: Track,
    historyTracks: Track[],
    persistentHistory: { url: string }[] = [],
): Set<string> {
    const allHistoryTracks = getAllHistoryTracks(queue)
    const mostRecentHistoryUrl = allHistoryTracks[0]?.url
    const mostRecentPersistentUrl = persistentHistory[0]?.url
    const allUrls = [
        currentTrack.url,
        ...historyTracks.map((t) => t.url),
        ...queue.tracks.toArray().map((t) => t.url),
        ...persistentHistory.map((e) => e.url).filter(Boolean),
        ...(mostRecentHistoryUrl ? [mostRecentHistoryUrl] : []),
        ...(mostRecentPersistentUrl ? [mostRecentPersistentUrl] : []),
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

export function buildExcludedKeys(
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
        const core = extractSongCore(t.title ?? '', t.author)
        if (core) keys.push(normalizeText(core))
    }
    return new Set(keys)
}

export function isDuplicateCandidate(
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
    if (excludedKeys.has(normalizeTitleOnly(track.title))) return true
    const core = extractSongCore(track.title ?? '', track.author)
    if (core !== null && excludedKeys.has(normalizeText(core))) return true

    const candidateTitle = normalizeTitleOnly(track.title)
    if (candidateTitle.length >= 5) {
        for (const key of excludedKeys) {
            if (key.includes('::') || key.length < 5) continue
            if (
                calculateStringSimilarity(candidateTitle, key) >=
                FUZZY_TITLE_THRESHOLD
            ) {
                return true
            }
        }
    }
    return false
}

export function selectDiverseCandidates(
    candidates: Map<string, ScoredTrack>,
    missingTracks: number,
    maxPerArtist = MAX_TRACKS_PER_ARTIST,
    maxPerSource = MAX_TRACKS_PER_SOURCE,
    seedArtistKey = '',
): ScoredTrack[] {
    const jitteredCandidates = Array.from(candidates.values()).map((c) => ({
        ...c,
        jitteredScore: c.score + randomJitter(0.02),
    })) as (ScoredTrack & { jitteredScore: number })[]

    const sortedCandidates = jitteredCandidates.sort(
        (a, b) => b.jitteredScore - a.jitteredScore,
    )
    const selected: ScoredTrack[] = []
    const artistCount = new Map<string, number>(
        seedArtistKey ? [[seedArtistKey, 1]] : [],
    )
    const sourceCount = new Map<string, number>()
    const selectedTitleKeys = new Set<string>()

    for (const candidate of sortedCandidates) {
        const artistKey = candidate.track.author.toLowerCase()
        const sourceKey = (candidate.track.source ?? 'unknown').toLowerCase()
        const titleKey = normalizeTitleOnly(candidate.track.title)
        const core = extractSongCore(
            candidate.track.title ?? '',
            candidate.track.author,
        )
        const coreKey = core ? normalizeText(core) : null

        if ((artistCount.get(artistKey) ?? 0) >= maxPerArtist) continue
        if ((sourceCount.get(sourceKey) ?? 0) >= maxPerSource) continue
        if (selectedTitleKeys.has(titleKey || artistKey)) continue
        if (coreKey && selectedTitleKeys.has(coreKey)) continue

        selected.push(candidate)
        artistCount.set(artistKey, (artistCount.get(artistKey) ?? 0) + 1)
        sourceCount.set(sourceKey, (sourceCount.get(sourceKey) ?? 0) + 1)
        selectedTitleKeys.add(titleKey || artistKey)
        if (coreKey) selectedTitleKeys.add(coreKey)
        if (selected.length >= missingTracks) {
            break
        }
    }

    return selected
}

export async function addSelectedTracks(
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
        const core = extractSongCore(
            candidate.track.title ?? '',
            candidate.track.author,
        )
        if (core) excludedKeys.add(normalizeText(core))
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

export function purgeDuplicatesOfCurrentTrack(
    queue: GuildQueue,
    currentTrack: Track,
): void {
    const urls = new Set<string>()
    if (currentTrack.url) {
        urls.add(currentTrack.url)
        const vid = extractYouTubeVideoId(currentTrack.url)
        if (vid) urls.add(vid)
    }
    const keys = new Set<string>()
    keys.add(normalizeTrackKey(currentTrack.title, currentTrack.author))
    keys.add(normalizeTitleOnly(currentTrack.title))
    const core = extractSongCore(currentTrack.title ?? '', currentTrack.author)
    if (core) keys.add(normalizeText(core))

    for (const track of queue.tracks.toArray()) {
        if (isDuplicateCandidate(track, urls, keys)) {
            queue.node.remove(track)
            debugLog({
                message: 'Autoplay: purged stale duplicate of now-playing',
                data: {
                    removed: track.title,
                    nowPlaying: currentTrack.title,
                },
            })
        }
    }
}

export { ScoredTrack }
