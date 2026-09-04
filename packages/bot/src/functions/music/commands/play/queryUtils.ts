import { QueryType } from 'discord-player'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'

const SPOTIFY_EXTRACTOR_ID = 'com.discord-player.itsmaat.spotifyextractor'
import type { CustomClient } from '../../../../types'
import { preferExactMatch } from './handlers/resolveProvider'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../../services/musicManagement/queueResolver'
import { buildPlayResponseEmbed } from '../../../../utils/music/nowPlayingEmbed'
import {
    createMusicControlButtons,
    createMusicActionButtons,
} from '../../../../utils/music/buttonComponents'
import { createErrorEmbed } from '../../../../utils/general/embeds'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { withTimeout } from '@lucky/shared/utils/async'
import { assertDefined } from '@lucky/shared/utils/guards'

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
    return query.startsWith('http://') || query.startsWith('https://')
}

/**
 * Expands SoundCloud short links (on.soundcloud.com) by following the HTTP redirect.
 * Returns the expanded URL if successful, or the original URL if expansion fails.
 * Uses a 5-second timeout to prevent hanging requests.
 *
 * Security: only expands on.soundcloud.com hosts and validates the resolved URL
 * is a soundcloud.com domain before returning it.
 */
export async function expandSoundCloudShortUrl(url: string): Promise<string> {
    // Fast path: not a short link
    if (!url.includes('on.soundcloud.com')) {
        return url
    }

    try {
        const parsed = new URL(url)
        if (parsed.hostname !== 'on.soundcloud.com') {
            return url
        }

        // Follow redirects with a 5-second timeout, using HEAD first (no body download)
        const expanded = await withTimeout(
            (async () => {
                const response = await (global.fetch as typeof fetch)(url, {
                    method: 'HEAD',
                    redirect: 'follow',
                })
                const finalUrl = response.url

                // Security check: ensure resolved URL is a soundcloud domain
                const finalParsed = new URL(finalUrl)
                if (
                    finalParsed.hostname !== 'soundcloud.com' &&
                    !finalParsed.hostname?.endsWith('.soundcloud.com')
                ) {
                    // Redirect went somewhere unexpected — reject and fall back
                    throw new Error(
                        `Redirect destination is not a soundcloud.com domain: ${finalUrl}`,
                    )
                }

                debugLog({
                    message: 'SoundCloud short URL expanded',
                    data: { originalUrl: url, expandedUrl: finalUrl },
                })

                return finalUrl
            })(),
            5000,
            'soundcloud-short-url-expansion',
        )

        return expanded
    } catch (error) {
        // Network error, timeout, or security validation failed — gracefully
        // fall back. warn, not debug: debug is filtered out in production, so
        // the user saw a generic "No results found" from the resolver with no
        // record that expansion was the step that actually failed (#1994).
        warnLog({
            message:
                'SoundCloud short URL expansion failed, using original URL',
            data: {
                originalUrl: url,
                error: String(error),
            },
        })
        return url
    }
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

export function resolveSearchEngine(
    query: string,
    provider?: string | null,
): QueryType {
    if (isUrl(query)) return QueryType.AUTO

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

    try {
        await interaction.deferReply()
    } catch (error) {
        if (isUnknownInteractionError(error)) return
        throw error
    }

    const query = interaction.options.getString('query', true)

    try {
        const searchEngine = resolveSearchEngine(query)
        const afterSearch = preferExactMatch(query)
        let result
        try {
            result = await client.player.play(voiceChannel, query, {
                searchEngine,
                afterSearch,
            })
        } catch (primaryError) {
            if (searchEngine !== QueryType.AUTO) {
                warnLog({
                    message: 'Primary search failed, falling back to YouTube',
                    data: {
                        query,
                        searchEngine: String(searchEngine),
                        error: String(primaryError),
                    },
                })
                try {
                    result = await client.player.play(voiceChannel, query, {
                        searchEngine: QueryType.YOUTUBE_SEARCH,
                        blockExtractors: [SPOTIFY_EXTRACTOR_ID],
                        afterSearch,
                    })
                } catch (youtubeError) {
                    warnLog({
                        message:
                            'YouTube search failed, falling back to SoundCloud',
                        data: { query, error: String(youtubeError) },
                    })
                    result = await client.player.play(voiceChannel, query, {
                        searchEngine: QueryType.SOUNDCLOUD_SEARCH,
                        blockExtractors: [SPOTIFY_EXTRACTOR_ID],
                        afterSearch,
                    })
                }
            } else {
                throw primaryError
            }
        }
        const track = result.track

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

        const tracks = queue.tracks.toArray()
        if (tracks.length > 0) {
            queue.node.remove(track)
            queue.insertTrack(track, 0)
            if (skipCurrent) queue.node.skip()
        }

        const embed = buildPlayResponseEmbed(
            skipCurrent
                ? { kind: 'nowPlaying', track, requestedBy: interaction.user }
                : {
                      kind: 'addedToQueue',
                      track,
                      requestedBy: interaction.user,
                      queuePosition: 1,
                  },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [embed],
                components: [
                    createMusicControlButtons(queue),
                    createMusicActionButtons(queue),
                ],
            },
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

        errorLog({
            message: `${commandName} error:`,
            error,
            data: { query, guildId: interaction.guildId },
        })

        try {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Play Error',
                            createUserFriendlyError(error),
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
}
