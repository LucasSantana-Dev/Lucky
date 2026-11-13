import type { Track, GuildQueue } from 'discord-player'
import { LRUCache } from 'lru-cache'
import { debugLog } from '@lucky/shared/utils'
import {
    extractSongCore,
    cleanTitle,
    cleanAuthor,
} from '../../../utils/music/searchQueryCleaner'
import { primaryArtistKey } from '../../../utils/music/trackNormalization'
import { calculateStringSimilarity } from '../../../utils/music/duplicateDetection/similarityChecker'
import { markAndRecordAutoplayTrack } from './queueMarkers'
import { extractYouTubeVideoId } from './scoringUtils'
import { trackSource, trackAlbumName } from '../../../utils/music/trackFields'
import type { RecommendationBasis } from './recommendationBasis.js'

interface ScoredTrack {
    track: Track
    score: number
    basis: RecommendationBasis
}

const MAX_TRACKS_PER_ARTIST = 2
const MAX_TRACKS_PER_SOURCE = 3
const FUZZY_TITLE_THRESHOLD = 0.75

// #2667: autoplay used to write a track_history row when it queued a pick, so
// the next replenish would not pick it again, but that row counted as a play
// even when the track never played. The queue, the player's history and the
// rows written when a track actually plays already cover the exclusion; this
// covers a pick that was queued and then cleared or removed before it played.
const RECOMMENDED_TTL_MS = 2 * 60 * 60 * 1000

type RememberedPick = { title?: string; author?: string; at: number }

// Per guild, each pick keyed by URL with its own timestamp: the LRU bounds
// memory, the timestamp bounds how long one pick stays excluded. Title and
// author are kept so the same song from another URL is excluded too.
const recentlyRecommended = new LRUCache<string, Map<string, RememberedPick>>({
    max: 1000,
    ttl: RECOMMENDED_TTL_MS,
})

function rememberRecommended(guildId: string, track: Track): void {
    const picks = recentlyRecommended.get(guildId) ?? new Map()
    picks.set(track.url, {
        title: track.title,
        author: track.author,
        at: Date.now(),
    })
    recentlyRecommended.set(guildId, picks)
}

/** The guild's picks from the last 2 hours; older ones are dropped. */
function recentPicks(
    queue: GuildQueue,
): Array<{ url: string; title?: string; author?: string }> {
    const picks = queue.guild
        ? recentlyRecommended.get(queue.guild.id)
        : undefined
    if (!picks) return []
    const cutoff = Date.now() - RECOMMENDED_TTL_MS
    const live: Array<{ url: string; title?: string; author?: string }> = []
    for (const [url, pick] of picks) {
        if (pick.at < cutoff) picks.delete(url)
        else live.push({ url, title: pick.title, author: pick.author })
    }
    return live
}

export function __resetRecentlyRecommendedForTests(): void {
    recentlyRecommended.clear()
}

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
        { tracks?: { toArray?: () => Track[]; data?: Track[] } } | undefined

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
        ...recentPicks(queue).map((p) => p.url),
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
        ...recentPicks(queue),
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

// "RamJamVEVO" and "Ram Jam - Topic" are Ram Jam's own channels.
function coverArtistKey(author?: string): string {
    return normalizeText(primaryArtistKey(author ?? '')).replace(
        /(?:vevo|topic)$/,
        '',
    )
}

function songKeys(track: Track): string[] {
    const title = track.title ?? ''
    const keys = [normalizeTitleOnly(stripVariantSuffix(title))]
    const core = extractSongCore(title, track.author)
    if (core) keys.push(normalizeText(core))
    return [...new Set(keys.filter(Boolean))]
}

/**
 * Candidates that are another artist's version of a song whose original is
 * also in the batch. A listener who asks for related music does not want a
 * cover: on 2026-11-13 Shinedown's "Simple Man" outscored Lynyrd Skynyrd's
 * own, because recency decay had pushed the seed artist down.
 *
 * Per song, the original is the artist with the most versions in the batch;
 * an upload whose title names a batch artist ("Lost Panda - Aerosmith -
 * Dream On") counts for that artist too. A top tie goes to the seed artist,
 * or is left alone: nothing is dropped when the original is unclear.
 */
function findCoverCandidates(
    candidates: ScoredTrack[],
    seedArtistKey: string,
): Set<ScoredTrack> {
    const artistOf = new Map(
        candidates.map((c) => [c, coverArtistKey(c.track.author)]),
    )
    const batchArtists = new Set(
        [...artistOf.values()].filter((a) => a.length >= 4),
    )
    const credits = new Map<ScoredTrack, Set<string>>()
    for (const c of candidates) {
        const own = artistOf.get(c) ?? ''
        const title = normalizeText(c.track.title)
        const credited = new Set(own ? [own] : [])
        for (const artist of batchArtists) {
            if (title.includes(artist)) credited.add(artist)
        }
        credits.set(c, credited)
    }

    const groups = new Map<string, ScoredTrack[]>()
    for (const c of candidates) {
        for (const key of songKeys(c.track)) {
            groups.set(key, [...(groups.get(key) ?? []), c])
        }
    }

    const seed = normalizeText(seedArtistKey)
    const covers = new Set<ScoredTrack>()
    for (const members of groups.values()) {
        const votes = new Map<string, number>()
        for (const c of members) {
            for (const artist of credits.get(c) ?? []) {
                votes.set(artist, (votes.get(artist) ?? 0) + 1)
            }
        }
        if (votes.size < 2) continue
        const top = Math.max(...votes.values())
        const leaders = [...votes].filter(([, n]) => n === top).map(([a]) => a)
        const original =
            leaders.length === 1
                ? leaders[0]
                : leaders.includes(seed)
                  ? seed
                  : null
        if (!original) continue
        for (const c of members) {
            if (!credits.get(c)?.has(original)) covers.add(c)
        }
    }
    return covers
}

export function selectDiverseCandidates(
    candidates: Map<string, ScoredTrack>,
    missingTracks: number,
    maxPerArtist = MAX_TRACKS_PER_ARTIST,
    maxPerSource = MAX_TRACKS_PER_SOURCE,
    seedArtistKey = '',
    reserveAnchor = false,
): ScoredTrack[] {
    const jitteredCandidates = Array.from(candidates.values()).map((c) => ({
        ...c,
        jitteredScore: c.score + randomJitter(0.02),
    })) as (ScoredTrack & { jitteredScore: number })[]

    const sortedCandidates = jitteredCandidates.sort(
        (a, b) => b.jitteredScore - a.jitteredScore,
    )
    // Keep one slot for the seed's own artist and related artists, so a
    // strong liked profile cannot fill the whole buffer (#2961).
    if (reserveAnchor) {
        const anchorIndex = sortedCandidates.findIndex(
            (c) => c.basis.source === 'seed-similar' && c.score > 0,
        )
        if (anchorIndex > 0) {
            const [anchor] = sortedCandidates.splice(anchorIndex, 1)
            sortedCandidates.unshift(anchor)
        }
    }
    const selected: ScoredTrack[] = []
    const artistCount = new Map<string, number>(
        seedArtistKey ? [[seedArtistKey, 1]] : [],
    )
    const sourceCount = new Map<string, number>()
    const selectedTitleKeys = new Set<string>()
    const selectedAlbums = new Set<string>()
    const covers = findCoverCandidates(sortedCandidates, seedArtistKey)

    for (const candidate of sortedCandidates) {
        if (covers.has(candidate)) continue
        // Primary artist, so "Artist, Remixer" shares the cap with "Artist".
        const artistKey = primaryArtistKey(candidate.track.author)
        const sourceKey = (
            trackSource(candidate.track) ?? 'unknown'
        ).toLowerCase()
        const titleKey = normalizeTitleOnly(candidate.track.title)
        const albumName = trackAlbumName(candidate.track)?.toLowerCase() ?? ''
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
        rememberRecommended(guildId, candidate.track)
    }

    await Promise.all(telemetryWrites)
}

export function purgeDuplicatesOfCurrentTrack(
    queue: GuildQueue,
    currentTrack: Track,
): Track[] {
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

    const removed: Track[] = []
    for (const track of queue.tracks.toArray()) {
        if (isDuplicateCandidate(track, urls, keys)) {
            queue.node.remove(track)
            removed.push(track)
            debugLog({
                message: 'Autoplay: purged stale duplicate of now-playing',
                data: {
                    removed: track.title,
                    nowPlaying: currentTrack.title,
                },
            })
        }
    }
    return removed
}

export { ScoredTrack }
