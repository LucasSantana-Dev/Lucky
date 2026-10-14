import type { YtSearchCandidate } from './ytdlpProcess'

// Same validation idea as soundcloudMatcher.findMatchingSoundCloudResult: the
// first YouTube hit for a Spotify track is often a radio rip, a DJ upload or
// a live version, so every hit has to match the title, the duration and carry
// no version marker the Spotify track itself lacks before it is played.

export type YouTubeMatchTarget = {
    // Cleaned Spotify title and credits, as used for the search query.
    title: string
    author: string
    // Raw Spotify title: cleanTitle strips "(Ao Vivo)" and similar, which
    // decides whether a live/remix candidate is the right version.
    sourceTitle: string
    duration?: string
}

export type ScoredYouTubeCandidate = YtSearchCandidate & { score: number }

export type RejectedYouTubeCandidate = {
    id: string
    title: string
    channel: string
    durationSec: number | null
    reason: 'title' | 'duration' | 'marker' | 'channel'
}

const TITLE_MATCH_THRESHOLD = 0.75
// Tighter than SoundCloud's 30 s: Spotify and YouTube "- Topic" durations
// agree within a few seconds, and the 2026-10-14 report had a different
// recording of the same song exactly 30 s off.
const MAX_DURATION_DELTA_SEC = 20

// Markers of a different recording or a non-music upload. Only counted in a
// tag of the title (see versionMarkers); a marker the Spotify title also tags
// is allowed ("Ao Vivo" track), and so is one in the credits ("DJ Snake").
const VERSION_MARKERS = [
    'ao vivo',
    'en vivo',
    'live',
    'cover',
    'karaoke',
    'remix',
    'mix',
    'megamix',
    'dj',
    'radio',
    'vinheta',
    'playback',
    'instrumental',
    'acustico',
    'acoustic',
    'sped up',
    'slowed',
    'reverb',
    'nightcore',
    '8d',
]
// Channels that rebroadcast music: radio stations, DJ and karaoke channels.
const CHANNEL_MARKERS = ['radio', 'fm', 'dj', 'karaoke']

// Folds accents and case but keeps every script's letters and digits, so
// Japanese, Korean or Cyrillic titles can still pass the title gate.
function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
}

function words(value: string): string[] {
    return normalize(value).split(' ').filter(Boolean)
}

function hasPhrase(normalized: string, phrase: string): boolean {
    return ` ${normalized} `.includes(` ${phrase} `)
}

function parseDurationSec(duration?: string): number | null {
    if (!duration) return null
    const parts = duration.split(':').map(Number)
    if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) {
        return null
    }
    const total = parts.reduce((sum, part) => sum * 60 + part, 0)
    return total > 0 ? total : null
}

function tokenScore(tokens: string[], candidateWords: Set<string>): number {
    if (tokens.length === 0) return 0
    return tokens.filter((t) => candidateWords.has(t)).length / tokens.length
}

// Not split on "&": it is part of duo names such as "Simon & Garfunkel".
function creditedArtists(author: string): string[] {
    return author
        .split(/,|;|\bfeat\.?\s|\bft\.?\s/i)
        .map((name) => normalize(name))
        .filter(Boolean)
}

const TAG_RE = /\(([^)]*)\)|\[([^\]]*)\]/g // NOSONAR: S8786, video and track titles are ~100 chars, backtracking is bounded
const TITLE_SEPARATORS = [' - ', ' | ', ' \u2013 ', ' \u2014 ']

// Version markers a title carries as a tag: inside "(...)" or "[...]", or as
// the whole last " - " segment ("Song - Live", "Song - Remix Version"). A
// bare word is part of the song name ("Live Forever", "Radio Ga Ga").
function versionMarkers(title: string): string[] {
    const tags = [...title.matchAll(TAG_RE)].map((m) =>
        normalize(m[1] ?? m[2] ?? ''),
    )
    const untagged = title.replace(TAG_RE, ' ')
    const cut = Math.max(
        ...TITLE_SEPARATORS.map((s) => untagged.lastIndexOf(s)),
    )
    const suffix =
        cut > 0
            ? normalize(untagged.slice(cut + 3)).replace(
                  / (version|edit|mix)$/,
                  '',
              )
            : ''
    return VERSION_MARKERS.filter(
        (m) => suffix === m || tags.some((tag) => hasPhrase(tag, m)),
    )
}

type MatchContext = {
    gateTokens: string[]
    fullTokens: string[]
    requested: string
    requestedMarkers: string[]
    artists: string[]
    trackSec: number | null
}

function buildContext(target: YouTubeMatchTarget): MatchContext {
    // Gate on the title without its parentheticals: "Song (feat. X)" is
    // often uploaded as plain "Song". The full title only adds to the score.
    const coreTitle = target.title.replace(TAG_RE, ' ').trim() || target.title
    const authorNorm = normalize(target.author)
    return {
        gateTokens: words(coreTitle),
        fullTokens: words(target.title),
        requested: normalize(
            `${target.sourceTitle} ${target.title} ${target.author}`,
        ),
        requestedMarkers: [
            ...versionMarkers(target.sourceTitle),
            ...VERSION_MARKERS.filter((m) => hasPhrase(authorNorm, m)),
        ],
        artists: creditedArtists(target.author),
        trackSec: parseDurationSec(target.duration),
    }
}

function durationDelta(
    ctx: MatchContext,
    candidate: YtSearchCandidate,
): number | null {
    return ctx.trackSec !== null && candidate.durationSec !== null
        ? Math.abs(candidate.durationSec - ctx.trackSec)
        : null
}

function rejectionReason(
    ctx: MatchContext,
    candidate: YtSearchCandidate,
): RejectedYouTubeCandidate['reason'] | null {
    const titleNorm = normalize(candidate.title)
    const channelNorm = normalize(candidate.channel)
    const isUnrequested = (marker: string) => !hasPhrase(ctx.requested, marker)

    if (
        tokenScore(ctx.gateTokens, new Set(titleNorm.split(' '))) <
        TITLE_MATCH_THRESHOLD
    ) {
        return 'title'
    }
    if (
        CHANNEL_MARKERS.some(
            (m) => hasPhrase(channelNorm, m) && isUnrequested(m),
        )
    ) {
        return 'channel'
    }
    if (
        versionMarkers(candidate.title).some(
            (m) => !ctx.requestedMarkers.includes(m),
        )
    ) {
        return 'marker'
    }
    // A hit without a duration is a live stream or an unknown upload: only
    // acceptable when there is no Spotify duration to compare.
    if (ctx.trackSec !== null) {
        const delta = durationDelta(ctx, candidate)
        if (delta === null || delta > MAX_DURATION_DELTA_SEC) return 'duration'
    }
    return null
}

function scoreCandidate(
    ctx: MatchContext,
    candidate: YtSearchCandidate,
): number {
    const titleNorm = normalize(candidate.title)
    const isTopic = / - topic$/i.test(candidate.channel.trim())
    // Compared without spaces so "LeciBrandaoVEVO" counts as the artist.
    const channelCompact = normalize(candidate.channel).replaceAll(' ', '')
    const artistChannel = ctx.artists.some((a) =>
        channelCompact.includes(a.replaceAll(' ', '')),
    )
    const artistMentioned =
        artistChannel || ctx.artists.some((a) => hasPhrase(titleNorm, a))
    const delta = durationDelta(ctx, candidate)
    return (
        tokenScore(ctx.fullTokens, new Set(titleNorm.split(' '))) +
        (isTopic ? 0.5 : 0) +
        (artistChannel ? 0.3 : 0) +
        (artistMentioned ? 0.2 : 0) +
        (delta === null ? 0 : 0.5 * (1 - delta / MAX_DURATION_DELTA_SEC))
    )
}

export function pickYouTubeCandidate(
    target: YouTubeMatchTarget,
    candidates: readonly YtSearchCandidate[],
): {
    pick: ScoredYouTubeCandidate | null
    rejected: RejectedYouTubeCandidate[]
} {
    const ctx = buildContext(target)
    const rejected: RejectedYouTubeCandidate[] = []
    let pick: ScoredYouTubeCandidate | null = null

    for (const candidate of candidates) {
        const reason = rejectionReason(ctx, candidate)
        if (reason) {
            rejected.push({ ...candidate, reason })
            continue
        }
        const score = scoreCandidate(ctx, candidate)
        // Strictly greater: on a tie the earlier search hit wins.
        if (!pick || score > pick.score) pick = { ...candidate, score }
    }

    return { pick, rejected }
}

export function youtubeWatchUrl(id: string): string {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
}
