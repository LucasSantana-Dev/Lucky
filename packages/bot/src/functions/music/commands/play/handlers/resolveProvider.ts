import { QueryType } from 'discord-player'
import type {
    Player,
    PlayerNodeInitializerOptions,
    PlayerNodeInitializationResult,
    SearchResult,
} from 'discord-player'
import type { VoiceBasedChannel } from 'discord.js'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'
import {
    cleanSearchQuery,
    hasVersionMarker,
    queryRequestsVersion,
} from '../../../../../utils/music/searchQueryCleaner'
import {
    isSpotifyBlocked,
    spotifyBlockRemainingSeconds,
} from '../../../../../handlers/player/spotifyApiFailureLog'
import { isHostedYoutubeEnabled } from '../../../../../config/featureFlags'
import { parseYoutubeLink, type YoutubeLink } from '../queryDetector'
import {
    ensureTrackMetadata,
    fetchYoutubeOEmbed,
} from './trackMetadataHydration'
import {
    YoutubePlaylistUnavailableError,
    YoutubeVideoUnavailableError,
} from './youtubeLinkErrors'

export { YoutubePlaylistUnavailableError, YoutubeVideoUnavailableError }

const SPOTIFY_EXTRACTOR_ID = 'com.discord-player.itsmaat.spotifyextractor'
const ATTACHMENT_EXTRACTOR_ID = 'com.discord-player.attachmentextractor'

// Extractors whose validate() ignores queryType and will therefore claim a
// plain text search they cannot serve. Blocked on the text-search fallback
// arms so the query reaches the provider the arm is actually named after.
//
// SpotifyExtractor was the first offender. AttachmentExtractor is the second:
// with the YouTube extractor degraded it captured both the YOUTUBE_SEARCH and
// SOUNDCLOUD_SEARCH arms, so every arm failed as
// "NoResultError (Extractor: com.discord-player.attachmentextractor)" and the
// SoundCloud fallback never actually ran (#1930).
export const TEXT_SEARCH_BLOCKED_EXTRACTORS = [
    SPOTIFY_EXTRACTOR_ID,
    ATTACHMENT_EXTRACTOR_ID,
]

/**
 * Search options for a query that may be plain text or a URL, on an engine
 * that is not Spotify's. Plain text gets TEXT_SEARCH_BLOCKED_EXTRACTORS,
 * otherwise SpotifyExtractor claims it and a Spotify outage returns nothing.
 * A URL is left alone: a Spotify link must still reach the Spotify
 * extractor, and its validate() already rejects every other URL.
 */
export function textSearchBlockOptions(query: string): {
    blockExtractors?: string[]
} {
    return /^https?:\/\//i.test(query.trim())
        ? {}
        : { blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS }
}

// Folds Latin accents ("Beyoncé" -> "beyonce") but keeps combining marks in
// other scripts, where a vowel sign changes the word (Devanagari "कु" vs "क").
function wordsOf(value: string): string[] {
    return value
        .normalize('NFD')
        .replaceAll(/(\p{Script=Latin})\p{M}+/gu, '$1')
        .toLowerCase()
        .split(/[^\p{L}\p{M}\p{N}]+/u)
        .filter(Boolean)
}

/**
 * Some extractors (Spotify's raw search API in particular) return their own
 * top hit as tracks[0] with no relevance re-ranking, so a short/ambiguous
 * query like "Prince" can surface a same-genre act (e.g. Prince Royce)
 * ahead of the artist the query actually names. This promotes a candidate
 * whose title or author exactly matches the query or, failing that, whose
 * title and author together make up the query ("song artist" in either
 * order), leaving descriptive queries untouched.
 *
 * It also demotes a top candidate carrying an unrequested version marker
 * (remix, sped up, 8D audio, etc. — see noiseTerms.json) when an earlier or
 * later candidate in the same result set has none, so a query with no such
 * marker doesn't default to an edit/remix/repost just because it search-
 * ranked first (#2133). A query that names the version itself (e.g. "Song
 * Remix") is left alone — nothing here overrides an explicit request.
 */
export function preferExactMatch(
    query: string,
): (result: SearchResult) => Promise<SearchResult> {
    const normalizedQuery = query.trim().toLowerCase()

    return async (result) => {
        // Stamps the original query onto every candidate track's metadata so
        // downstream logs can pair requested-vs-resolved title instead of
        // just scanning resolved titles for remix/edit keywords. Skipped for
        // URL queries (direct link or playlist link) — a URL resolves to an
        // exact known target, not a text-search that can drift to a remix,
        // so a "requestedQuery" full of a raw URL (repeated on every
        // playlist track) would be noise with no requested-vs-delivered
        // signal (#2134 review).
        const isUrlQuery = /^https?:\/\//i.test(query.trim())
        if (!isUrlQuery) {
            for (const track of result.tracks) {
                const existingMetadata =
                    track.metadata && typeof track.metadata === 'object'
                        ? (track.metadata as Record<string, unknown>)
                        : {}
                track.setMetadata({
                    ...existingMetadata,
                    requestedQuery: query,
                })
            }
        }

        if (result.hasPlaylist() || result.tracks.length <= 1) return result

        let tracks = result.tracks
        let workingResult = result
        if (!queryRequestsVersion(normalizedQuery)) {
            const topHasMarker = hasVersionMarker(tracks[0]?.title ?? '')
            const cleanIndex = tracks.findIndex(
                (track) => !hasVersionMarker(track.title ?? ''),
            )
            if (topHasMarker && cleanIndex > 0) {
                const demoted = [...tracks]
                const [cleanTrack] = demoted.splice(cleanIndex, 1)
                demoted.unshift(cleanTrack)
                tracks = demoted
                workingResult = result.setTracks(demoted)
            }
        }

        let bestIndex = tracks.findIndex((track) => {
            const author = track.author?.trim().toLowerCase()
            const title = track.title?.trim().toLowerCase()
            return author === normalizedQuery || title === normalizedQuery
        })
        if (bestIndex === -1) {
            // "halo beyonce" / "beyonce halo": every word of the title and
            // of the author is in the query, in any order. A cover titled
            // "Halo (Beyoncé Cover)" carries an extra word and stays put.
            const queryWords = new Set(wordsOf(normalizedQuery))
            const covered = (value?: string) => {
                const words = wordsOf(value ?? '')
                return words.length > 0 && words.every((w) => queryWords.has(w))
            }
            bestIndex = tracks.findIndex(
                (track) => covered(track.title) && covered(track.author),
            )
        }
        if (bestIndex <= 0) return workingResult

        const reordered = [...tracks]
        const [bestTrack] = reordered.splice(bestIndex, 1)
        reordered.unshift(bestTrack)
        return result.setTracks(reordered)
    }
}

// #2145: discord-player-spotify's client-credentials search() (used for
// plain-text queries) wraps its whole HTTP round trip — including the
// client-credentials token fetch — in a bare try/catch that swallows any
// failure into a plain empty result, which surfaces here as NoResultError.
// A transient token/network hiccup and a genuine no-match are therefore
// indistinguishable from this side, but only the token/network case is
// worth retrying: the library's GraphQL search path already retries on its
// own, this one doesn't. One immediate retry is safe because search()
// throwing means no queue/voice connection was created yet.
//
// NoResultError is not part of discord-player's public exports (checked
// dist/index.js and dist/index.d.ts — not in either), so `instanceof` isn't
// available here. discord-player's DiscordPlayerError base class sets
// `this.name = this.constructor.name` on every instance, so `.name` is a
// stable, instance-level check rather than depending on constructor
// identity across module boundaries.
function isNoResultError(error: unknown): boolean {
    return error instanceof Error && error.name === 'NoResultError'
}

export type PlayResolutionArm =
    | 'primary'
    | 'youtube-fallback'
    | 'soundcloud-fallback'
    | 'youtube-title-fallback'
    | 'failed'

interface ResolutionTelemetry {
    resolvedVia: PlayResolutionArm
    latencyMs: number
    requestedProvider: string
    errorClass?: string
    /** Which arm served the text search behind 'youtube-title-fallback'. */
    titleFallbackVia?: PlayResolutionArm
}

type Resolution = {
    result: PlayerNodeInitializationResult<unknown>
    telemetry: ResolutionTelemetry
}

// The bridge's all-stages-failed error reaches here wrapped by discord-player
// in a NoResultError, but match the bare one too in case it is not wrapped.
function isLinkUnresolvedError(error: unknown): boolean {
    if (isNoResultError(error)) return true
    return (
        error instanceof Error &&
        (error.name === 'BridgeExhaustedError' ||
            error.message.includes('Bridge exhausted'))
    )
}

/**
 * "Song Artist" text for a YouTube video, read from oEmbed (which keeps
 * answering while innertube and yt-dlp are behind the bot check). Null when
 * oEmbed returns no title.
 */
export async function youtubeTitleQuery(
    videoId: string,
): Promise<string | null> {
    const data = await fetchYoutubeOEmbed(
        `https://www.youtube.com/watch?v=${videoId}`,
    )
    const title = typeof data?.title === 'string' ? data.title.trim() : ''
    const author = typeof data?.author_name === 'string' ? data.author_name : ''
    if (!title) return null
    return cleanSearchQuery(title, author) || title
}

/**
 * Wraps the exact-match reranker so the caller learns about a non-empty
 * result as soon as the search has produced it, before discord-player goes on
 * to connect to voice and create the stream (seconds on a cold start). The
 * callback is fire-and-forget: a throw in it must never fail the play.
 */
function rerankThenNotify(
    query: string,
    onSearchResolved?: (result: SearchResult) => void,
): (result: SearchResult) => Promise<SearchResult> {
    const rerank = preferExactMatch(query)
    return async (result) => {
        // Before the notify: the early reply must not show a blank title,
        // and a track with no metadata must be rejected before play starts.
        const ranked = await ensureTrackMetadata(await rerank(result))
        if (onSearchResolved && ranked.tracks.length > 0) {
            try {
                onSearchResolved(ranked)
            } catch (error) {
                warnLog({
                    message: 'onSearchResolved callback failed',
                    data: { error: String(error) },
                })
            }
        }
        return ranked
    }
}

/**
 * Resolve a query via the discord-player with fallback chain.
 * Emits telemetry breadcrumbs for observability.
 *
 * `onSearchResolved` runs on every arm that finds results, right after the
 * search and before the voice connection and stream, so the caller can answer
 * the user without waiting for audio. Because a later arm can also resolve
 * (for example after a voice connect failure), it may fire more than once.
 */
export async function resolveQueryWithFallbacks(
    player: Player,
    voiceChannel: VoiceBasedChannel,
    query: string,
    requestedProvider: string,
    searchEngine: QueryType,
    playOptions: PlayerNodeInitializerOptions<unknown>,
    onSearchResolved?: (result: SearchResult) => void,
): Promise<Resolution> {
    const chain = (
        chainQuery: string,
        engine: QueryType,
        youtubeArm: boolean,
    ): Promise<Resolution> =>
        resolveWithChain({
            player,
            voiceChannel,
            query: chainQuery,
            requestedProvider,
            searchEngine: engine,
            playOptions: { ...playOptions, searchEngine: engine },
            onSearchResolved,
            youtubeArm,
        })

    const youtubeLink =
        searchEngine === QueryType.AUTO ? parseYoutubeLink(query) : null
    if (!youtubeLink) {
        return chain(query, searchEngine, isHostedYoutubeEnabled())
    }

    const startTime = Date.now()
    let linkError: unknown
    // With HOSTED_YOUTUBE_ENABLED=false no YouTube extractor is registered,
    // so asking for the link could only fail (or let a catch-all extractor
    // claim it): go straight to the title fallback.
    if (isHostedYoutubeEnabled()) {
        try {
            return await chain(query, searchEngine, true)
        } catch (error) {
            if (!isLinkUnresolvedError(error)) throw error
            linkError = error
        }
    }

    // The link just failed on YouTube (or YouTube is off), so the title
    // search skips the YouTube arm: Spotify first, then SoundCloud.
    return resolveYoutubeLinkByTitle(
        youtubeLink,
        linkError,
        startTime,
        (text) => chain(text, QueryType.SPOTIFY_SEARCH, false),
    )
}

async function resolveYoutubeLinkByTitle(
    link: YoutubeLink,
    linkError: unknown,
    startTime: number,
    searchByText: (query: string) => Promise<Resolution>,
): Promise<Resolution> {
    if (link.kind === 'playlist') {
        throw new YoutubePlaylistUnavailableError({ cause: linkError })
    }

    const titleQuery = await youtubeTitleQuery(link.videoId)
    if (!titleQuery) {
        warnLog({
            message: 'YouTube link failed and oEmbed returned no title',
            data: { videoId: link.videoId, error: String(linkError) },
        })
        throw linkError ?? new YoutubeVideoUnavailableError()
    }

    warnLog({
        message: 'YouTube link failed, searching its title instead',
        data: {
            videoId: link.videoId,
            titleQuery,
            error:
                linkError === undefined
                    ? 'youtube disabled'
                    : String(linkError),
        },
    })
    try {
        const { result, telemetry } = await searchByText(titleQuery)
        return {
            result,
            telemetry: {
                ...telemetry,
                resolvedVia: 'youtube-title-fallback',
                titleFallbackVia: telemetry.resolvedVia,
                latencyMs: Date.now() - startTime,
            },
        }
    } catch (textError) {
        // When the title search also found nothing, report the link's own
        // failure; any other error (voice, stream) is the real problem.
        if (linkError !== undefined && isLinkUnresolvedError(textError)) {
            throw linkError
        }
        throw textError
    }
}

type ChainInput = {
    player: Player
    voiceChannel: VoiceBasedChannel
    query: string
    requestedProvider: string
    searchEngine: QueryType
    playOptions: PlayerNodeInitializerOptions<unknown>
    onSearchResolved: ((result: SearchResult) => void) | undefined
    /** False skips the YouTube text-search arm (YouTube off, or it just failed). */
    youtubeArm: boolean
}

async function resolveWithChain({
    player,
    voiceChannel,
    query,
    requestedProvider,
    searchEngine,
    playOptions,
    onSearchResolved,
    youtubeArm,
}: ChainInput): Promise<Resolution> {
    const startTime = Date.now()
    const telemetry: ResolutionTelemetry = {
        resolvedVia: 'primary',
        latencyMs: 0,
        requestedProvider,
    }
    const resolvedPlayOptions = {
        ...playOptions,
        afterSearch: rerankThenNotify(query, onSearchResolved),
    }

    // While a Spotify 429 block is active the primary search can only fail,
    // so go straight to the next arm without the retry or the warn (#2971).
    const spotifyBlocked =
        searchEngine === QueryType.SPOTIFY_SEARCH && isSpotifyBlocked()
    if (spotifyBlocked) {
        infoLog({
            message: 'Spotify blocked, skipping primary search',
            data: {
                query,
                remainingSeconds: spotifyBlockRemainingSeconds(),
            },
        })
    }

    try {
        if (spotifyBlocked) throw new Error('Spotify blocked')
        // Attempt primary resolution
        const result = await player.play(
            voiceChannel,
            query,
            resolvedPlayOptions,
        )
        telemetry.latencyMs = Date.now() - startTime
        telemetry.resolvedVia = 'primary'
        return { result, telemetry }
    } catch (primaryError) {
        if (searchEngine !== QueryType.AUTO) {
            // Retry the primary provider once before conceding to YouTube.
            // Scoped to Spotify: the swallowed-failure behavior this works
            // around (see isNoResultError above) is specific to
            // discord-player-spotify's client-credentials search(). An
            // explicit YouTube/SoundCloud NoResultError is a real no-match
            // from a provider with no such bug, so it should fall straight
            // through to the next fallback instead of paying a retry.
            let lastPrimaryError = primaryError
            if (
                !spotifyBlocked &&
                searchEngine === QueryType.SPOTIFY_SEARCH &&
                isNoResultError(primaryError)
            ) {
                try {
                    const result = await player.play(
                        voiceChannel,
                        query,
                        resolvedPlayOptions,
                    )
                    telemetry.latencyMs = Date.now() - startTime
                    telemetry.resolvedVia = 'primary'
                    return { result, telemetry }
                } catch (retryError) {
                    lastPrimaryError = retryError
                }
            }

            // HOSTED_YOUTUBE_ENABLED (decisions/2026-09-27-music-first-
            // positioning.md point 3): with no YouTube extractor registered,
            // this arm would only pay for a guaranteed NoResultError, so skip
            // straight to the SoundCloud fallback instead of attempting it.
            if (youtubeArm) {
                if (!spotifyBlocked) {
                    warnLog({
                        message:
                            'Primary search failed, falling back to YouTube',
                        data: {
                            query,
                            requestedProvider,
                            searchEngine: String(searchEngine),
                            error: String(lastPrimaryError),
                        },
                    })
                }

                try {
                    // Attempt YouTube fallback. See
                    // TEXT_SEARCH_BLOCKED_EXTRACTORS for why these are excluded.
                    const result = await player.play(voiceChannel, query, {
                        ...resolvedPlayOptions,
                        searchEngine: QueryType.YOUTUBE_SEARCH,
                        blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS,
                    })
                    telemetry.latencyMs = Date.now() - startTime
                    telemetry.resolvedVia = 'youtube-fallback'
                    return { result, telemetry }
                } catch (_youtubeError) {
                    warnLog({
                        message:
                            'YouTube search failed, falling back to SoundCloud',
                        data: { query, error: String(_youtubeError) },
                    })
                }
            } else if (!spotifyBlocked) {
                warnLog({
                    message:
                        'Primary search failed, YouTube disabled, falling back to SoundCloud',
                    data: {
                        query,
                        requestedProvider,
                        searchEngine: String(searchEngine),
                        error: String(lastPrimaryError),
                    },
                })
            }

            try {
                // Attempt SoundCloud fallback, same block reason as above
                const result = await player.play(voiceChannel, query, {
                    ...resolvedPlayOptions,
                    searchEngine: QueryType.SOUNDCLOUD_SEARCH,
                    blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS,
                })
                telemetry.latencyMs = Date.now() - startTime
                telemetry.resolvedVia = 'soundcloud-fallback'
                return { result, telemetry }
            } catch (soundcloudError) {
                // All fallbacks exhausted
                telemetry.latencyMs = Date.now() - startTime
                telemetry.resolvedVia = 'failed'
                telemetry.errorClass = (
                    soundcloudError as Error
                ).constructor.name
                throw soundcloudError
            }
        } else {
            // No fallbacks available for AUTO
            telemetry.latencyMs = Date.now() - startTime
            telemetry.resolvedVia = 'failed'
            telemetry.errorClass = (primaryError as Error).constructor.name
            throw primaryError
        }
    }
}

/**
 * Emit telemetry breadcrumb for play resolution.
 * Non-throwing to prevent telemetry from breaking the play flow.
 */
export function emitPlayResolutionTelemetry(
    telemetry: ResolutionTelemetry,
): void {
    try {
        addBreadcrumb(
            `play_provider_resolution: ${telemetry.resolvedVia}`,
            'play',
            'info',
            {
                requestedProvider: telemetry.requestedProvider,
                resolvedVia: telemetry.resolvedVia,
                latencyMs: telemetry.latencyMs,
                ...(telemetry.errorClass
                    ? { errorClass: telemetry.errorClass }
                    : {}),
                ...(telemetry.titleFallbackVia
                    ? { titleFallbackVia: telemetry.titleFallbackVia }
                    : {}),
            },
        )
    } catch {
        // Telemetry must never break the play flow
    }
}
