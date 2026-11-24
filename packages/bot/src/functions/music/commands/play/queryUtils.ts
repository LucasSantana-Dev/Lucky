import { QueryType } from 'discord-player'
import type {
    GuildQueue,
    PlayerNodeInitializationResult,
    PlayerNodeInitializerOptions,
    SearchResult,
    Track,
} from 'discord-player'
import type {
    ChatInputCommandInteraction,
    GuildMember,
    VoiceBasedChannel,
} from 'discord.js'

import type { CustomClient } from '../../../../types'
import {
    preferExactMatch,
    SOUNDCLOUD_FALLBACK_BLOCKED_EXTRACTORS,
    TEXT_SEARCH_BLOCKED_EXTRACTORS,
} from './handlers/resolveProvider'
import { ensureTrackMetadata } from './handlers/trackMetadataHydration'
import { resolveAlbumIntent } from './handlers/albumIntent'
import { reserveCollaborativeRequest } from './handlers/collaborativeLimit'
import {
    classifyPlayFailure,
    logPlayFailure,
    resolvePlayErrorMessage,
} from './handlers/playErrorMessage'
import { markCommandOutcome } from '../../../../utils/monitoring/commandOutcome'
import {
    AsmrBlockedError,
    assertNotAsmr,
    assertQueryNotAsmr,
} from '../../../../utils/music/asmrFilter'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../../services/musicManagement/queueResolver'
import { buildPlayResponseEmbed } from '../../../../utils/music/nowPlayingEmbed'
import {
    createErrorEmbed,
    createWarningEmbed,
} from '../../../../utils/general/embeds'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { withTimeout } from '@lucky/shared/utils/async'
import { assertDefined } from '@lucky/shared/utils/guards'
import { isHost } from '../../../../utils/general/urlHost'
import { isHostedYoutubeEnabled } from '../../../../config/featureFlags'
import { translatorForInteraction } from '../../../../i18n/translatorForInteraction'

export { isHost }

export const DISCORD_UNKNOWN_INTERACTION_CODE = 10062

export function isUnknownInteractionError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === DISCORD_UNKNOWN_INTERACTION_CODE
    )
}

export function isUrl(query: string): boolean {
    return /^https?:\/\//i.test(query)
}

type ShortLinkRule = {
    /** Service name used in logs, e.g. "SoundCloud". */
    label: string
    /** Exact hosts of the service's short links. */
    shortHosts: readonly string[]
    /** True for a host the expanded link may land on. */
    isTargetHost: (host: string) => boolean
    /**
     * HEAD skips the body. GET is for a service whose short link may answer
     * a non-browser with a page that links the target instead of redirecting,
     * so the link is read from the page.
     */
    method: 'HEAD' | 'GET'
}

const SOUNDCLOUD_SHORT_LINK: ShortLinkRule = {
    label: 'SoundCloud',
    shortHosts: ['on.soundcloud.com'],
    isTargetHost: (host) =>
        host === 'soundcloud.com' || host.endsWith('.soundcloud.com'),
    method: 'HEAD',
}

// Links from the Spotify mobile share sheet (#3274).
const SPOTIFY_SHORT_LINK: ShortLinkRule = {
    label: 'Spotify',
    shortHosts: ['spotify.link', 'spotify.app.link'],
    isTargetHost: (host) => host === 'open.spotify.com',
    method: 'GET',
}

/** Host of an http(s) URL; null for anything else (file:, data:, junk). */
function hostOf(url: string): string | null {
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return null
        }
        return parsed.hostname.toLowerCase().replace(/\.$/, '')
    } catch {
        return null
    }
}

function findTargetInPage(page: string, rule: ShortLinkRule): string | null {
    for (const match of page.matchAll(/https:\/\/[^\s"'<>]+/g)) {
        const candidate = match[0].replaceAll('&amp;', '&')
        const host = hostOf(candidate)
        if (host && rule.isTargetHost(host)) return candidate
    }
    return null
}

const MAX_SHORT_LINK_HOPS = 5

/**
 * Follows the short link one redirect at a time and checks every `Location`
 * before requesting it: only the rule's short hosts are ever fetched, and the
 * first target-host URL is returned without fetching it. Following redirects
 * blindly would let a crafted short link make the bot request any URL,
 * including internal ones.
 */
async function resolveShortLink(
    url: string,
    rule: ShortLinkRule,
): Promise<string> {
    let current = url
    for (let hop = 0; hop < MAX_SHORT_LINK_HOPS; hop++) {
        const response = await (global.fetch as typeof fetch)(current, {
            method: rule.method,
            redirect: 'manual',
        })
        const location = response.headers?.get('location')
        if (response.status >= 300 && response.status < 400 && location) {
            const next = new URL(location, current).toString()
            const nextHost = hostOf(next)
            // Short hosts first: on.soundcloud.com is also a soundcloud.com
            // subdomain, and a hop between short links is not the target.
            if (nextHost && rule.shortHosts.includes(nextHost)) {
                current = next
                continue
            }
            if (nextHost && rule.isTargetHost(nextHost)) return next
            throw new Error(
                `Redirect destination is not a ${rule.label} URL: ${next}`,
            )
        }

        const fromPage =
            rule.method === 'GET'
                ? findTargetInPage(await response.text(), rule)
                : null
        if (fromPage) return fromPage
        throw new Error(
            `${rule.label} short link did not redirect (status ${response.status})`,
        )
    }
    throw new Error(`${rule.label} short link redirected too many times`)
}

/**
 * Expands a short link by following its redirect, with a 5-second timeout.
 * Returns the original URL when it is not one of the rule's short links or
 * when expansion fails.
 *
 * Security: only the rule's exact short hosts are requested, redirects are
 * checked hop by hop, and the result must land on one of its target hosts.
 */
async function expandShortLink(
    url: string,
    rule: ShortLinkRule,
): Promise<string> {
    const host = hostOf(url)
    if (!host || !rule.shortHosts.includes(host)) return url

    try {
        const expanded = await withTimeout(
            resolveShortLink(url, rule),
            5000,
            `${rule.label.toLowerCase()}-short-url-expansion`,
        )
        debugLog({
            message: `${rule.label} short URL expanded`,
            data: { originalUrl: url, expandedUrl: expanded },
        })
        return expanded
    } catch (error) {
        // Network error, timeout, or security validation failed: gracefully
        // fall back. warn, not debug: debug is filtered out in production, so
        // the user saw a generic "No results found" from the resolver with no
        // record that expansion was the step that actually failed (#1994).
        warnLog({
            message: `${rule.label} short URL expansion failed, using original URL`,
            data: { originalUrl: url, error: String(error) },
        })
        return url
    }
}

/** Expands on.soundcloud.com short links to the soundcloud.com URL. */
export function expandSoundCloudShortUrl(url: string): Promise<string> {
    return expandShortLink(url, SOUNDCLOUD_SHORT_LINK)
}

/** Expands spotify.link and spotify.app.link to the open.spotify.com URL. */
export function expandSpotifyShortUrl(url: string): Promise<string> {
    return expandShortLink(url, SPOTIFY_SHORT_LINK)
}

/**
 * True when the URL's real host is `domain` or a subdomain of it.
 *
 * Testing the raw URL string with `includes` is not enough: any third-party
 * link that merely mentions the domain somewhere (a share wrapper, a
 * `?ref=youtube.com` param, a path segment) would match, and we would rewrite
 * the query params of a URL that has nothing to do with that service.
 */
function hasHost(url: URL, ...domains: string[]): boolean {
    // A fully qualified host may carry a trailing root dot ("youtube.com."),
    // which URL.hostname preserves and which would otherwise miss every match.
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    return domains.some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
    )
}

/**
 * Strips SoundCloud playlist-context query params (`?in=...`) that the
 * SoundCloud extractor cannot resolve. The bare track URL resolves correctly.
 */
export function normalizeSoundCloudUrl(url: string): string {
    if (!isUrl(url)) return url

    try {
        const parsed = new URL(url)
        if (!hasHost(parsed, 'soundcloud.com')) return url
        parsed.searchParams.delete('in')
        return parsed.toString()
    } catch (error) {
        // Same reasoning as expandSoundCloudShortUrl above (#1994): warn, not
        // debug, so a malformed URL reaching here leaves a trace instead of
        // silently skipping normalization.
        warnLog({
            message: 'SoundCloud URL normalization failed, using original URL',
            data: { originalUrl: url, error: String(error) },
        })
        return url
    }
}

/**
 * Strips YouTube Mix / radio context from a watch URL.
 *
 * A "Mix" (`list=RD<videoId>`, usually with `start_radio=1`) is generated on
 * demand by YouTube and is not a real playlist, so the youtubei extractor
 * cannot resolve it and returns NoResultError for the whole query. The bare
 * watch URL for the same video resolves fine, which is exactly what was
 * observed in production: `watch?v=Gx9xqXlU9gE&list=RDGx9xqXlU9gE&start_radio=1`
 * failed, and `watch?v=Gx9xqXlU9gE` played seconds later.
 *
 * Only auto-generated lists are stripped. A real playlist id (`PL...`, `UU...`,
 * `OL...`) is left alone, because a user pasting a playlist URL usually means
 * to queue the playlist.
 *
 * Same shape as normalizeSoundCloudUrl above, which strips SoundCloud's
 * equivalent `?in=` playlist context.
 */
export function normalizeYouTubeUrl(url: string): string {
    if (!isUrl(url)) return url

    try {
        const parsed = new URL(url)
        if (!hasHost(parsed, 'youtube.com', 'youtu.be')) return url
        const list = parsed.searchParams.get('list')

        // RD = radio/mix. RDMM is "My Mix". Both are generated per-request.
        if (list && /^RD/i.test(list)) {
            parsed.searchParams.delete('list')
            parsed.searchParams.delete('start_radio')
            // `index` only means something inside a list; left behind it makes
            // the URL look like a playlist position that no longer exists.
            parsed.searchParams.delete('index')
        }

        return parsed.toString()
    } catch (error) {
        warnLog({
            message: 'YouTube URL normalization failed, using original URL',
            data: { originalUrl: url, error: String(error) },
        })
        return url
    }
}

/**
 * Turns a raw query into what the player should search: expands short links,
 * strips playlist context the extractors cannot resolve, and applies album
 * intent. Shared by /play, /playtop and /playskip so a link that works on one
 * works on all of them (#3270).
 */
export async function prepareQuery(
    rawQuery: string,
    provider: string | null,
): Promise<string> {
    // Expand short links first (on.soundcloud.com, spotify.link).
    // Trimmed: a pasted link with a stray space fails isUrl and would skip
    // every normalizer below.
    const expandedQuery = await expandSpotifyShortUrl(
        await expandSoundCloudShortUrl(rawQuery.trim()),
    )
    // Then normalize: SoundCloud `?in=` playlist context, and YouTube Mix
    // (`list=RD...`) context that the youtubei extractor cannot resolve.
    const normalizedQuery = normalizeYouTubeUrl(
        normalizeSoundCloudUrl(expandedQuery),
    )
    // "album esquinas anavitória completo": queue the album's link, which
    // plays the whole album, instead of searching for a single track. A
    // YouTube or SoundCloud provider choice keeps its own search.
    return provider && provider !== 'spotify'
        ? normalizedQuery
        : ((await resolveAlbumIntent(normalizedQuery)) ?? normalizedQuery)
}

/**
 * True when `url` is hosted on youtube.com or youtu.be. This is a host check,
 * not a watch-link check: a playlist, channel, or bare-domain URL also
 * matches, which is correct here since all of those require the YouTube
 * extractor too.
 */
export function isYouTubeUrl(url: string): boolean {
    const trimmed = url.trim()
    if (!isUrl(trimmed)) return false
    try {
        return hasHost(new URL(trimmed), 'youtube.com', 'youtu.be')
    } catch {
        return false
    }
}

/**
 * When YouTube is disabled on the hosted bot (HOSTED_YOUTUBE_ENABLED=false)
 * and the request can only be served by YouTube (a pasted YouTube URL, or
 * `provider: youtube` explicitly picked in the slash command), reply with a
 * friendly, translated notice instead of letting the search silently fail
 * with a generic "no results" error. Returns true when it replied (caller
 * should stop), false otherwise.
 */
export async function replyYoutubeDisabledIfNeeded(
    interaction: ChatInputCommandInteraction,
    query: string,
    provider?: string | null,
): Promise<boolean> {
    if (isHostedYoutubeEnabled()) return false
    if (provider !== 'youtube' && !isYouTubeUrl(query)) return false

    const t = await translatorForInteraction(interaction)
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createWarningEmbed(
                    t('music.errors.youtubeDisabledTitle'),
                    t('music.errors.youtubeDisabledDescription'),
                ),
            ],
            ephemeral: true,
        },
    })
    return true
}

export function resolveSearchEngine(
    query: string,
    provider?: string | null,
): QueryType {
    // Trimmed so a pasted link with stray spaces still counts as a link.
    if (isUrl(query.trim())) return QueryType.AUTO

    switch (provider) {
        case 'youtube':
            return QueryType.YOUTUBE_SEARCH
        case 'soundcloud':
            return QueryType.SOUNDCLOUD_SEARCH
        case 'spotify':
            return QueryType.SPOTIFY_SEARCH
        default:
            // Spotify first: best metadata (titles, artwork, artist).
            // Fallback chain in play/index.ts tries YouTube then AUTO if Spotify throws.
            return QueryType.SPOTIFY_SEARCH
    }
}

type PlayAtTopOptions = {
    client: CustomClient
    interaction: ChatInputCommandInteraction
    skipCurrent: boolean
    commandName: string
}

/**
 * Marks every track of a resolved playlist, so `track_history` records
 * `isPlaylist` whichever command queued it. Returns whether it was a playlist.
 */
export function stampPlaylistTracks(
    searchResult: Pick<SearchResult, 'playlist' | 'tracks'> | undefined,
): boolean {
    if (!searchResult?.playlist) return false
    for (const track of searchResult.tracks) {
        const existing =
            track.metadata && typeof track.metadata === 'object'
                ? (track.metadata as Record<string, unknown>)
                : {}
        track.setMetadata({ ...existing, isPlaylist: true })
    }
    return true
}

type PlayAtTopArms = {
    client: CustomClient
    voiceChannel: VoiceBasedChannel
    query: string
    searchEngine: QueryType
    afterSearch: NonNullable<
        PlayerNodeInitializerOptions<unknown>['afterSearch']
    >
}

/**
 * Primary search, then YouTube (when hosted YouTube is on), then SoundCloud.
 * ASMR blocks are rethrown at every arm: another provider would only find
 * the same ASMR. AUTO has no fallbacks.
 */
export async function playWithFallbacks({
    client,
    voiceChannel,
    query,
    searchEngine,
    afterSearch,
}: PlayAtTopArms): Promise<PlayerNodeInitializationResult<unknown>> {
    try {
        return await client.player.play(voiceChannel, query, {
            searchEngine,
            afterSearch,
        })
    } catch (primaryError) {
        if (primaryError instanceof AsmrBlockedError) throw primaryError
        if (searchEngine === QueryType.AUTO) throw primaryError

        if (!isHostedYoutubeEnabled()) {
            warnLog({
                message:
                    'Primary search failed, YouTube disabled, falling back to SoundCloud',
                data: {
                    query,
                    searchEngine: String(searchEngine),
                    error: String(primaryError),
                },
            })
            return playSoundCloudArm(client, voiceChannel, query, afterSearch)
        }

        warnLog({
            message: 'Primary search failed, falling back to YouTube',
            data: {
                query,
                searchEngine: String(searchEngine),
                error: String(primaryError),
            },
        })
        try {
            return await client.player.play(voiceChannel, query, {
                searchEngine: QueryType.YOUTUBE_SEARCH,
                blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS,
                afterSearch,
            })
        } catch (youtubeError) {
            if (youtubeError instanceof AsmrBlockedError) throw youtubeError
            warnLog({
                message: 'YouTube search failed, falling back to SoundCloud',
                data: { query, error: String(youtubeError) },
            })
            return playSoundCloudArm(client, voiceChannel, query, afterSearch)
        }
    }
}

function playSoundCloudArm(
    client: CustomClient,
    voiceChannel: VoiceBasedChannel,
    query: string,
    afterSearch: PlayAtTopArms['afterSearch'],
): Promise<PlayerNodeInitializationResult<unknown>> {
    return client.player.play(voiceChannel, query, {
        searchEngine: QueryType.SOUNDCLOUD_SEARCH,
        blockExtractors: SOUNDCLOUD_FALLBACK_BLOCKED_EXTRACTORS,
        afterSearch,
    })
}

/** Rerank, hydrate and ASMR-gate a search result before it is queued. */
export function buildAfterSearch(query: string): PlayAtTopArms['afterSearch'] {
    const rerank = preferExactMatch(query)
    return async (found: SearchResult) => {
        // Hydrated first: a bare link has no title or artist to check.
        assertQueryNotAsmr(query)
        const ranked = await ensureTrackMetadata(await rerank(found))
        assertNotAsmr(query, ranked)
        return ranked
    }
}

/** Moves the track to the head of a non-empty queue, optionally skipping. */
export function moveTrackToTop(
    queue: GuildQueue,
    track: Track,
    skipCurrent: boolean,
): void {
    if (queue.tracks.toArray().length === 0) return
    queue.node.remove(track)
    queue.insertTrack(track, 0)
    if (skipCurrent) queue.node.skip()
}

async function replyPlayAtTopError(
    interaction: ChatInputCommandInteraction,
    commandName: string,
    query: string,
    error: unknown,
): Promise<void> {
    logPlayFailure(`${commandName} error:`, error, {
        query,
        guildId: interaction.guildId,
    })
    markCommandOutcome(interaction, classifyPlayFailure(error))

    let t: ((key: string) => string) | undefined
    try {
        t = await translatorForInteraction(interaction)
    } catch {
        // English fallback text in resolvePlayErrorMessage
    }

    try {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Play Error',
                        resolvePlayErrorMessage(error, query, t),
                    ),
                ],
                ephemeral: true,
            },
        })
    } catch (replyError) {
        warnLog({
            message: `failed to send ${commandName} error reply`,
            error: replyError,
            data: { guildId: interaction.guildId },
        })
    }
}

/** Returns false when the interaction expired and nothing more can be sent. */
async function deferPublicReply(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    try {
        await interaction.deferReply()
        return true
    } catch (error) {
        if (isUnknownInteractionError(error)) return false
        throw error
    }
}

export async function executePlayAtTop({
    client,
    interaction,
    skipCurrent,
    commandName,
}: PlayAtTopOptions): Promise<void> {
    if (!interaction.guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'This command can only be used in a server',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const member = interaction.member as GuildMember
    if (!(await requireVoiceChannel(interaction))) return
    if (!(await requireDJRole(interaction, interaction.guildId))) return

    const voiceChannel = assertDefined(
        member.voice.channel,
        'voice channel present after requireVoiceChannel guard',
    )

    const rawQuery = interaction.options.getString('query', true)

    // Checked before deferring so the "YouTube is unavailable" notice can
    // still be its own ephemeral reply instead of editing the public defer
    // below, which would strip the ephemeral flag.
    if (await replyYoutubeDisabledIfNeeded(interaction, rawQuery)) return

    if (!(await deferPublicReply(interaction))) return

    const reservation = await reserveCollaborativeRequest(
        interaction,
        interaction.guildId,
    )
    if (!reservation) return

    // After the defer: short link expansion can take a few seconds.
    const query = await prepareQuery(rawQuery, null)

    try {
        const result = await playWithFallbacks({
            client,
            voiceChannel,
            query,
            searchEngine: resolveSearchEngine(query),
            afterSearch: buildAfterSearch(query),
        })
        const track = result.track
        reservation.commit()
        stampPlaylistTracks(result.searchResult)

        const { queue } = resolveGuildQueue(client, interaction.guildId)
        if (!queue) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed('Error', 'Could not create queue'),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        moveTrackToTop(queue, track, skipCurrent)

        // The controls live on the now-playing message, not on this reply.
        const embed = buildPlayResponseEmbed(
            skipCurrent
                ? { kind: 'nowPlaying', track, requestedBy: interaction.user }
                : {
                      kind: 'addedToQueue',
                      track,
                      requestedBy: interaction.user,
                      queuePosition: 1,
                  },
            await translatorForInteraction(interaction),
        )

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })

        debugLog({
            message: skipCurrent
                ? 'track added to top and current skipped'
                : 'track added to top of queue',
            data: { query, guildId: interaction.guildId },
        })
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            debugLog({
                message: `${commandName} interaction expired before reply`,
                data: { query, guildId: interaction.guildId },
            })
            return
        }
        await replyPlayAtTopError(interaction, commandName, query, error)
    } finally {
        reservation.settle()
    }
}
