import type { Track, GuildQueue } from 'discord-player'
import { debugLog } from '@lucky/shared/utils'
import { trackHistoryService } from '@lucky/shared/services'
import { extractSongCore, cleanTitle, cleanAuthor } from '../searchQueryCleaner'
import { calculateStringSimilarity } from '../duplicateDetection/similarityChecker'
import { markAsAutoplayTrack, markAndRecordAutoplayTrack } from './queueMarkers'
import { extractYouTubeVideoId } from './scoringUtils'
import type { RecommendationBasis } from './recommendationBasis.js'
import { serializeBasis } from './recommendationBasis.js'

interface ScoredTrack {
    track: Track
    score: number
    basis: RecommendationBasis
}

const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
const FUZZY_TITLE_THRESHOLD = 0.75

function randomJitter(max: number): number {
    return Math.random() * max // NOSONAR - non-cryptographic jitter for diversity selection
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
    const lower = author.toLowerCase()
    let cut = author.length
    for (const marker of [' feat ', ' feat.', ' ft ', ' ft.']) {
        const idx = lower.indexOf(marker)
        if (idx >= 0 && idx < cut) cut = idx
    }
    let result = author.slice(0, cut)
    // Remove parenthetical groups containing "feat" or "ft"
    let i = 0
    while (i < result.length) {
        const open = result.indexOf('(', i)
        if (open === -1) break
        const close = result.indexOf(')', open + 1)
        if (close === -1) break
        const inner = result.slice(open + 1, close).toLowerCase()
        if (
            inner.includes('feat') ||
            inner.startsWith('ft ') ||
            inner.startsWith('ft.')
        ) {
            result = (result.slice(0, open) + result.slice(close + 1)).trim()
            i = 0
        } else {
            i = close + 1
        }
    }
    return result.trim()
}

const VARIANT_KEYWORDS = [
    'remastered',
    'remaster',
    'remixed',
    'remix',
    'radio edit',
    'extended mix',
    'club mix',
    'vip mix',
    'edit',
    'version',
    'acoustic',
    'live',
    'cover',
]

function startsWithYear(s: string): boolean {
    return (
        s.length >= 5 &&
        s[4] === ' ' &&
        s[0] >= '0' &&
        s[0] <= '9' &&
        s[1] >= '0' &&
        s[1] <= '9' &&
        s[2] >= '0' &&
        s[2] <= '9' &&
        s[3] >= '0' &&
        s[3] <= '9'
    )
}

function stripVariantSuffix(title: string): string {
    const lower = title.toLowerCase()
    const trimmedLower = lower.trimEnd()

    // Strip parenthetical variant suffix at end: (Remastered) or [2015 Live]
    for (const [openChar, closeChar] of [
        ['(', ')'],
        ['[', ']'],
    ] as [string, string][]) {
        if (trimmedLower[trimmedLower.length - 1] !== closeChar) continue
        const lastOpen = trimmedLower.lastIndexOf(openChar)
        if (lastOpen < 0) continue
        let inner = trimmedLower
            .slice(lastOpen + 1, trimmedLower.length - 1)
            .trim()
        if (startsWithYear(inner)) inner = inner.slice(5)
        if (
            VARIANT_KEYWORDS.some(
                (v) => inner === v || inner.startsWith(v + ' '),
            )
        ) {
            return title.slice(0, lastOpen).trimEnd()
        }
    }

    // Strip dash-prefixed variant suffix at end: - Remastered or – 2015 Live
    for (const sep of [' - ', ' – ']) {
        const idx = lower.lastIndexOf(sep)
        if (idx < 0) continue
        let rest = lower.slice(idx + sep.length).trimEnd()
        if (startsWithYear(rest)) rest = rest.slice(5)
        if (
            VARIANT_KEYWORDS.some((v) => rest === v || rest.startsWith(v + ' '))
        ) {
            return title.slice(0, idx).trimEnd()
        }
    }
    return title
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
        const variantStripped = stripVariantSuffix(t.title ?? '')
        if (variantStripped) keys.push(normalizeTitleOnly(variantStripped))
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
    const candidateTitleStripped = normalizeTitleOnly(
        stripVariantSuffix(track.title ?? ''),
    )
    if (candidateTitleStripped && excludedKeys.has(candidateTitleStripped))
        return true
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
    const selectedAlbums = new Set<string>()

    for (const candidate of sortedCandidates) {
        const artistKey = candidate.track.author.toLowerCase()
        const sourceKey = (candidate.track.source ?? 'unknown').toLowerCase()
        const titleKey = normalizeTitleOnly(candidate.track.title)
        const albumName = candidate.track.raw?.album?.name?.toLowerCase() ?? ''
        const core = extractSongCore(
            candidate.track.title ?? '',
            candidate.track.author,
        )
        const coreKey = core ? normalizeText(core) : null

        if ((artistCount.get(artistKey) ?? 0) >= maxPerArtist) continue
        if ((sourceCount.get(sourceKey) ?? 0) >= maxPerSource) continue
        if (albumName && selectedAlbums.has(albumName)) {
            const jitteredScore = candidate.jitteredScore - 0.12
            if (jitteredScore < 0) continue
        }
        if (selectedTitleKeys.has(titleKey || artistKey)) continue
        if (coreKey && selectedTitleKeys.has(coreKey)) continue

        selected.push(candidate)
        artistCount.set(artistKey, (artistCount.get(artistKey) ?? 0) + 1)
        sourceCount.set(sourceKey, (sourceCount.get(sourceKey) ?? 0) + 1)
        selectedTitleKeys.add(titleKey || artistKey)
        if (coreKey) selectedTitleKeys.add(coreKey)
        if (albumName) selectedAlbums.add(albumName)
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
    mode?: 'similar' | 'discover' | 'popular',
): Promise<void> {
    const historyWrites: Promise<boolean>[] = []
    const telemetryWrites: Promise<void>[] = []
    const guildId = queue.guild.id

    for (const candidate of selected) {
        telemetryWrites.push(
            markAndRecordAutoplayTrack(
                candidate.track,
                candidate.basis,
                guildId,
                requestedById,
                mode,
            ),
        )
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

    await Promise.all([...historyWrites, ...telemetryWrites])
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
