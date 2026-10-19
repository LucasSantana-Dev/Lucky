import * as playdl from 'play-dl'
import type { Readable } from 'stream'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { withTimeout } from './withTimeout'
import { hasVersionMarker } from '../../utils/music/searchQueryCleaner'
import { streamViaYtDlp } from './ytdlpProcess'

type SoundCloudSearchResult = {
    name: string
    url: string
    permalink?: string
    durationInSec?: number
    user?: { name?: string }
}

export type SoundCloudMatchOptions = {
    /** Names the uploader account must carry (any one of them). */
    expectedArtists?: readonly string[]
    /** Uncleaned source title: a version word in it counts as requested. */
    sourceTitle?: string
}

const TITLE_MATCH_THRESHOLD = 0.75

// Words that mark a different recording, not just a different release of the
// same one. Unlike the soft `hasVersionMarker` demotion (remaster, deluxe,
// explicit...), a result carrying one of these anywhere in its name is never
// played unless the request carries the same word: "( Perfect Slowed ) Tiktok
// Version" and "NØYCEY - FLASHING LIGHTS DUB" both slipped past the
// structured-position check and played instead of the original (2026-10-19).
const ALTERED_VERSION_TERMS: readonly string[] = [
    '8d',
    'acapella',
    'acoustic',
    'bass boosted',
    'bootleg',
    'chopped',
    'cover',
    'daycore',
    'dub',
    'flip',
    'instrumental',
    'karaoke',
    'live',
    'lofi',
    'lo fi',
    'mashup',
    'nightcore',
    'phonk',
    'rebuild',
    'remix',
    'reverb',
    'reversed',
    'rmx',
    'screwed',
    'slowed',
    'sped up',
    'speed up',
    'tiktok',
    'vip',
]
const CLIENT_ID_TIMEOUT_MS = 10_000
const REFRESH_COOLDOWN_MS = 60_000
export const SOUNDCLOUD_SEARCH_TIMEOUT_MS = 8_000
export const SOUNDCLOUD_STREAM_TIMEOUT_MS = 10_000

/**
 * play-dl authenticates SoundCloud with an anonymous client id scraped from
 * soundcloud.com, and those ids rotate. #2139: the id was fetched once at boot
 * and never refreshed, so once it expired every SoundCloud fallback stage
 * failed for the rest of the process lifetime while the bot still reported
 * healthy and logged nothing above debug level.
 *
 * Single-flight, because a queue that fails several tracks at once would
 * otherwise scrape a new id per failure.
 */
let refreshInFlight: Promise<void> | null = null
let lastRefreshAt = 0

export async function refreshSoundCloudClientId(): Promise<void> {
    refreshInFlight ??= (async () => {
        try {
            const clientId = await withTimeout(
                playdl.getFreeClientID(),
                CLIENT_ID_TIMEOUT_MS,
                'play-dl getFreeClientID',
            )
            await playdl.setToken({ soundcloud: { client_id: clientId } })
            infoLog({ message: 'play-dl: SoundCloud client ID initialized' })
        } finally {
            // Stamp the ATTEMPT, not the success. A refresh that fails (a 10s
            // getFreeClientID timeout, soundcloud.com unreachable) has to
            // throttle the next one too, or every following track pays that
            // same 10s scrape, which is the stall the cooldown exists to stop.
            lastRefreshAt = Date.now()
            refreshInFlight = null
        }
    })()
    return refreshInFlight
}

// Test-only: the cooldown above is module-level state, so tests that assert on
// the refresh path must reset it between cases instead of relying on run order.
export function __resetSoundCloudRefreshStateForTests(): void {
    refreshInFlight = null
    lastRefreshAt = 0
}

function isTimeoutError(error: unknown): boolean {
    return (
        error instanceof Error && /timed out after \d+ms$/.test(error.message)
    )
}

/**
 * Runs a play-dl network call; on failure refreshes the client id once and
 * retries. Only the play-dl calls are wrapped: the "no results" and "no
 * validated match" rejections below are raised after a *successful* search, so
 * a genuine miss never triggers a scrape.
 */
async function withClientIdRetry<T>(
    op: () => Promise<T>,
    label: string,
): Promise<T> {
    try {
        return await op()
    } catch (error) {
        // Not every rejection is an expired token: a deleted track, a socket
        // blip or a rate limit lands here too, and scraping a fresh id for each
        // of those would make a queue of bad tracks pay a 10s stall per track.
        // Classifying the error by message would be the obvious scope, but that
        // couples recovery to play-dl's wording and silently stops working when
        // it changes. A cooldown bounds the waste without reading the error:
        // a genuinely stale token is fixed by the first refresh, and everything
        // failing after it rethrows untouched.
        if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) throw error

        // A timeout is a slow network, not a stale token (a stale token is
        // rejected fast). Refreshing and retrying would stack another 10s
        // scrape and a second timed attempt on top of the budget the caller
        // already spent, so surface it as is. withTimeout is local, so its
        // message format is ours to rely on.
        if (isTimeoutError(error)) throw error

        warnLog({
            message: `SoundCloud: ${label} failed, refreshing client ID and retrying once`,
            error,
        })
        try {
            await refreshSoundCloudClientId()
        } catch {
            // Surface why the call actually failed, not why the recovery did.
            throw error
        }
        return op()
    }
}

/**
 * `expectedArtists` makes the uploader account the proof of origin. Without
 * it, "Flashing Lights" matched "NØYCEY - FLASHING LIGHTS DUB" for a Kanye
 * West track: right title, right duration, someone else's remix. Naming the
 * artist in the title is not enough either: "03 Simple man - Lynyrd Skynyrd"
 * by a fan account played instead of the original, because the official
 * Lynyrd Skynyrd uploads are 30s previews (2026-10-19). A miss here means the
 * track does not play, which the owner prefers to a cover.
 */
export async function streamViaSoundCloud(
    query: string,
    trackDuration?: string,
    options: SoundCloudMatchOptions = {},
): Promise<Readable> {
    if (!query.trim()) {
        throw new Error('SoundCloud: empty query')
    }

    const results = await withClientIdRetry(
        () =>
            withTimeout(
                playdl.search(query, {
                    source: { soundcloud: 'tracks' },
                    limit: 5,
                }),
                SOUNDCLOUD_SEARCH_TIMEOUT_MS,
                'play-dl search',
            ),
        'search',
    )

    if (!results.length) {
        throw new Error(`SoundCloud: no results for "${query}"`)
    }

    const match = findMatchingSoundCloudResult(
        query,
        trackDuration,
        results,
        options,
    )
    if (!match) {
        warnLog({
            message: 'SoundCloud: no validated match',
            data: {
                query,
                trackDuration,
                expectedArtists: options.expectedArtists,
                rejected: describeRejectedCandidates(
                    query,
                    trackDuration,
                    results,
                    options,
                ),
            },
        })
        throw new Error(
            `SoundCloud: no validated match for "${query}" (title/duration mismatch)`,
        )
    }
    infoLog({
        message: 'SoundCloud: matched',
        data: { query, track: match.name, uploader: match.user?.name },
    })

    // SoundCloud now lists an adaptive `abr_sq` HLS transcoding last, and
    // play-dl 1.9.7 always streams the last HLS format, whose URL answers
    // 404. The AAC formats before it are fMP4 segments, and play-dl drops
    // their init segment (EXT-X-MAP), so ffmpeg cannot decode those either.
    // yt-dlp handles both. play-dl stays as the fallback for mp3 tracks.
    if (match.permalink) {
        try {
            return await streamViaYtDlp(match.permalink)
        } catch (err) {
            warnLog({
                message: 'SoundCloud: yt-dlp stream failed, trying play-dl',
                data: { track: match.name, error: (err as Error).message },
            })
        }
    }

    let scStream: Awaited<ReturnType<typeof playdl.stream>>
    try {
        scStream = await withClientIdRetry(
            () =>
                withTimeout(
                    playdl.stream(match.url),
                    SOUNDCLOUD_STREAM_TIMEOUT_MS,
                    'play-dl stream',
                ),
            'stream',
        )
    } catch (err) {
        throw new Error(
            `SoundCloud: stream creation failed for "${match.name}" — ${(err as Error).message}`,
            { cause: err },
        )
    }
    return scStream.stream
}

export function findMatchingSoundCloudResult(
    query: string,
    trackDuration: string | undefined,
    results: readonly SoundCloudSearchResult[],
    { expectedArtists, sourceTitle }: SoundCloudMatchOptions = {},
): SoundCloudSearchResult | undefined {
    // Gate on the query with trailing parenthetical suffixes stripped so
    // version/comment suffixes ("(Comentário)", "(En Vivo)") do not inflate the
    // token count (#2866). Ranking below still looks at the full query tokens.
    const { tokens, fullTokens, hasStripped } = getQueryTokens(query)
    if (tokens.length === 0) return undefined

    const trackSec = parseDurationString(trackDuration)
    const artistKeys = toArtistKeys(expectedArtists)

    const requested = toRequestedText(query, sourceTitle)

    const candidates = results
        .map((result) => {
            const resultNorm = normalizeForMatch(result.name)
            if (!resultNorm) return null
            if (
                artistKeys.length > 0 &&
                !uploadedByArtist(artistKeys, result)
            ) {
                return null
            }
            if (isUnrequestedAlteredVersion(resultNorm, requested)) return null

            const matched = tokens.filter((token) =>
                resultNorm.includes(token),
            ).length
            const titleScore = matched / tokens.length
            if (titleScore < TITLE_MATCH_THRESHOLD) return null

            // Only meaningful when a suffix was stripped: how much of the full
            // query (suffix included) the result carries. Lets "Song (Remix)"
            // prefer the remix and "The Man (Who Sold the World)" prefer the
            // full title over a bare "The Man".
            const fullScore = hasStripped
                ? fullTokens.filter((token) => resultNorm.includes(token))
                      .length / fullTokens.length
                : 0

            if (
                trackSec !== null &&
                result.durationInSec &&
                Math.abs(result.durationInSec - trackSec) > 30
            ) {
                return null
            }

            return { result, titleScore, fullScore }
        })
        .filter(
            (
                c,
            ): c is {
                result: SoundCloudSearchResult
                titleScore: number
                fullScore: number
            } => c !== null,
        )

    if (candidates.length === 0) return undefined

    // The 75%-token threshold lets remixes/speedups/extended edits pass
    // title matching too (see comment below), so before ranking by title/
    // duration, prefer candidates with no unofficial-version marker in their
    // name — unless the query itself asked for one (#2133). Falls back to
    // the full candidate set when every candidate carries a marker, so a
    // genuine remix-only result still resolves instead of being dropped.
    let pool = candidates
    if (!hasVersionMarker(query)) {
        const clean = candidates.filter(
            (candidate) => !hasVersionMarker(candidate.result.name),
        )
        if (clean.length > 0) pool = clean
    }

    if (trackSec === null) {
        return pool.reduce(
            (best, candidate) =>
                candidate.fullScore > best.fullScore ? candidate : best,
            pool[0],
        ).result
    }

    // Prefer the closer title match first — an exact title match with no
    // duration data is a more trustworthy signal than a near-miss duration
    // match on a looser title. Only at equal title confidence does duration
    // closeness break the tie, as the cheapest remaining signal that a
    // candidate is the original recording rather than an altered one;
    // missing duration data is treated as neutral there, not disqualifying.
    return pool.reduce((best, candidate) => {
        if (candidate.fullScore !== best.fullScore) {
            return candidate.fullScore > best.fullScore ? candidate : best
        }
        if (candidate.titleScore !== best.titleScore) {
            return candidate.titleScore > best.titleScore ? candidate : best
        }
        if (!candidate.result.durationInSec) return best
        if (!best.result.durationInSec) return candidate
        const bestDiff = Math.abs(best.result.durationInSec - trackSec)
        const candidateDiff = Math.abs(
            candidate.result.durationInSec - trackSec,
        )
        return candidateDiff < bestDiff ? candidate : best
    }, pool[0]).result
}

function describeRejectedCandidates(
    query: string,
    trackDuration: string | undefined,
    results: readonly SoundCloudSearchResult[],
    { expectedArtists, sourceTitle }: SoundCloudMatchOptions = {},
): {
    name: string
    uploader?: string
    titleScore: number
    durationDeltaSec: number | null
    artistMatch?: boolean
    alteredVersion?: true
}[] {
    const { tokens } = getQueryTokens(query)
    const trackSec = parseDurationString(trackDuration)
    const artistKeys = toArtistKeys(expectedArtists)
    const requested = toRequestedText(query, sourceTitle)
    return results.slice(0, 5).map((result) => {
        const resultNorm = normalizeForMatch(result.name)
        const matched = tokens.filter((token) =>
            resultNorm.includes(token),
        ).length
        return {
            name: result.name,
            uploader: result.user?.name,
            titleScore: tokens.length
                ? Number((matched / tokens.length).toFixed(2))
                : 0,
            durationDeltaSec:
                trackSec !== null && result.durationInSec
                    ? Math.abs(result.durationInSec - trackSec)
                    : null,
            ...(artistKeys.length > 0 && {
                artistMatch: uploadedByArtist(artistKeys, result),
            }),
            ...(isUnrequestedAlteredVersion(resultNorm, requested) && {
                alteredVersion: true as const,
            }),
        }
    })
}

// One key per expected artist: the lead name with spaces dropped, so the
// account "kanyewest" and the author "LynyrdSkynyrd" (from "LynyrdSkynyrdVEVO")
// compare equal to "Kanye West" and "Lynyrd Skynyrd".
function toArtistKeys(expectedArtists: readonly string[] = []): string[] {
    const keys = expectedArtists.map((artist) =>
        toTokens(primaryArtist(artist)).join(''),
    )
    return [...new Set(keys.filter(Boolean))]
}

function toRequestedText(query: string, sourceTitle?: string): string {
    return ` ${normalizeForMatch(`${query} ${sourceTitle ?? ''}`)} `
}

function isUnrequestedAlteredVersion(
    resultNorm: string,
    requested: string,
): boolean {
    const name = ` ${resultNorm} `
    return ALTERED_VERSION_TERMS.some(
        (term) =>
            name.includes(` ${term} `) && !requested.includes(` ${term} `),
    )
}

// "Kanye West, JAY-Z" / "Kanye West feat. Rihanna": uploads name the lead.
// Only a credit separator ends the lead name: "&" stays (a duo like "Simon &
// Garfunkel" is one name) and feat/ft need a space before them, so names
// that start with them ("FT Island", "Feathers") are kept whole.
function primaryArtist(artist: string): string {
    return artist.split(/[,;]|\s(?:feat|ft)\b\.?/i)[0]
}

// The account name must be the artist's, give or take spacing and an
// "Official"/"VEVO" suffix: "Lynyrd Skynyrd", "lynyrdskynyrd" and "Lynyrd
// Skynyrd Official" pass, "kanyewestfan" and "Kanye West Fan" do not. The
// title is ignored: anyone can put the artist in it.
const ACCOUNT_SUFFIX = /(?:official|vevo)$/

function uploadedByArtist(
    artistKeys: readonly string[],
    result: SoundCloudSearchResult,
): boolean {
    const account = toTokens(result.user?.name ?? '').join('')
    if (!account) return false
    const bare = account.replace(ACCOUNT_SUFFIX, '')
    return artistKeys.some((key) => account === key || bare === key)
}

function normalizeForMatch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/ {2,}/g, ' ') // NOSONAR: S5852 — bounded input, no catastrophic backtracking risk
        .trim()
}

function toTokens(value: string): string[] {
    return normalizeForMatch(value).split(/ +/).filter(Boolean)
}

function getQueryTokens(query: string): {
    tokens: string[]
    fullTokens: string[]
    hasStripped: boolean
} {
    const fullTokens = toTokens(query)
    const stripped = toTokens(stripTrailingParentheticals(query))
    // A query that is only a bracketed group ("(Intro)") strips to nothing:
    // fall back to the unstripped query instead of rejecting it.
    if (stripped.length === 0) {
        return { tokens: fullTokens, fullTokens, hasStripped: false }
    }
    return {
        tokens: stripped,
        fullTokens,
        hasStripped: stripped.length !== fullTokens.length,
    }
}

// Strips trailing parenthetical/bracketed suffix groups from the query
// ("(Comentário)", "(En Vivo)", '(12" Version)') so they do not inflate the
// token count and push title scores below the match threshold (#2866).
// Only trailing groups are removed: a group in the middle of the title stays.
// Linear stack-based scan (no regex, so no backtracking), nested groups
// ("Song (Live (Acoustic) Version)") are one top-level group, and unmatched
// openers/closers are treated as plain text. Applied to the query only.
function stripTrailingParentheticals(value: string): string {
    const groups: { start: number; end: number }[] = []
    const open: number[] = []
    for (let i = 0; i < value.length; i++) {
        const ch = value[i]
        if (ch === '(' || ch === '[') {
            open.push(i)
        } else if ((ch === ')' || ch === ']') && open.length > 0) {
            const start = open.pop() as number
            if (open.length === 0) groups.push({ start, end: i })
        }
    }

    let end = value.length
    for (let g = groups.length - 1; g >= 0; g--) {
        if (value.slice(groups[g].end + 1, end).trim() !== '') break
        end = groups[g].start
    }
    return value.slice(0, end).trim()
}

export function parseDurationString(duration?: string): number | null {
    if (!duration) return null
    const parts = duration.split(':').map(Number)
    if (parts.some(Number.isNaN)) return null
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return null
}
