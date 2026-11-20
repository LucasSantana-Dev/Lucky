import { SlashCommandBuilder } from '@discordjs/builders'
import { QueryType } from 'discord-player'
import type { GuildMember } from 'discord.js'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { moveUserTrackToPriority } from '../../../services/musicManagement/queueManipulation'
import {
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
} from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'
import { errorLog, warnLog, searchSpotifyAlbums } from '@lucky/shared/utils'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { assertDefined } from '@lucky/shared/utils/guards'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { featureToggleService } from '@lucky/shared/services'
import { isUnknownInteractionError } from './play/queryUtils'
import { pickAlbum } from './play/handlers/albumIntent'
import { QUEUE_LEAVE_OPTIONS } from '../../../services/musicManagement/queueLeaveOptions'
import { AsmrBlockedError, isAsmrTrack } from '../../../utils/music/asmrFilter'

function isSpotifyAlbumUrl(query: string): boolean {
    try {
        const url = new URL(query)
        const isSpotifyHost = /(^|\.)spotify\.com$/i.test(url.hostname)
        const segments = url.pathname.split('/').filter(Boolean)
        return isSpotifyHost && segments.includes('album')
    } catch {
        return false
    }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('album')
        .setDescription('Queue all tracks from a specific album')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Album name or Spotify album URL')
                .setRequired(true)
                .setAutocomplete(true),
        )
        .addStringOption((option) =>
            option
                .setName('artist')
                .setDescription('Artist name to narrow the search (optional)')
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName('shuffle')
                .setDescription('Shuffle the album before queueing it')
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName('next')
                .setDescription('Play the album right after the current track')
                .setRequired(false),
        ),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
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

        const isEnabled = await featureToggleService.isEnabled(
            'ALBUM_COMMAND',
            {
                guildId: interaction.guildId,
            },
        )
        if (!isEnabled) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createWarningEmbed(
                            'Feature unavailable',
                            'The /album command is currently disabled.',
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
        const query = interaction.options.getString('query', true)
        const artistFilter = interaction.options.getString('artist')
        const shuffle = interaction.options.getBoolean('shuffle') ?? false
        const playNext = interaction.options.getBoolean('next') ?? false

        try {
            await interaction.deferReply()
        } catch (error) {
            if (isUnknownInteractionError(error)) return
            throw error
        }

        try {
            // A free-text query cannot reach an extractor's album branch: every
            // search QueryType hits a *track* search and responds with
            // `createResponse(null, tracks)`, so `searchResult.playlist` was
            // always null and every text query failed (#2050). Resolve the
            // query to an album URL first, then run the URL path that works.
            let albumUrl = isSpotifyAlbumUrl(query) ? query : null

            if (!albumUrl) {
                const albumQuery = artistFilter
                    ? `${query} ${artistFilter}`
                    : query
                const albums = await searchSpotifyAlbums(albumQuery, 20)
                // An explicit album request falls back to Spotify's top hit.
                const match = pickAlbum(albums, albumQuery) ?? albums[0]
                if (!match) {
                    warnLog({
                        message:
                            'Album query did not resolve to a Spotify album',
                        data: { query, artistFilter },
                    })
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'No album found',
                                    `No album matched **${query}**${artistFilter ? ` by **${artistFilter}**` : ''}. Try the full album title, or paste a Spotify album URL.`,
                                ),
                            ],
                        },
                    })
                    return
                }
                albumUrl = match.url
            }

            const searchResult = await client.player.search(albumUrl, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO,
            })

            if (!searchResult?.tracks.length) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'No results',
                                `No tracks found for **${query}**${artistFilter ? ` by **${artistFilter}**` : ''}.`,
                            ),
                        ],
                    },
                })
                return
            }

            if (!searchResult.playlist) {
                warnLog({
                    message: 'Resolved album URL returned no playlist',
                    data: { query, albumUrl },
                })
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'No album found',
                                'Spotify returned tracks but no album listing. Try again, or paste a Spotify album URL.',
                            ),
                        ],
                    },
                })
                return
            }

            // The queue drops ASMR as it is added, so count what stays (#3001).
            const tracks = searchResult.tracks.filter(
                (track) => !isAsmrTrack(track),
            )
            if (shuffle) {
                for (let i = tracks.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1))
                    ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
                }
            }
            const firstTrack = tracks[0]
            if (!firstTrack) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'No results',
                                new AsmrBlockedError().message,
                            ),
                        ],
                    },
                })
                return
            }

            const playResult = await client.player.play(
                voiceChannel,
                firstTrack.url,
                {
                    nodeOptions: {
                        metadata: {
                            channel: interaction.channel,
                            requestedBy: interaction.user,
                        },
                        connectionTimeout:
                            ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
                        ...QUEUE_LEAVE_OPTIONS,
                    },
                    requestedBy: interaction.user,
                    searchEngine: QueryType.SPOTIFY_SONG,
                },
            )

            const { queue } = resolveGuildQueue(client, interaction.guildId)
            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Could not create queue.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            // With `next` the album goes to the front of the queue in order.
            // The first track is only in the queue when something else was
            // already playing.
            let position = 0
            if (playNext && queue.tracks.toArray().includes(playResult.track)) {
                queue.node.remove(playResult.track)
                queue.insertTrack(playResult.track, 0)
                position = 1
            }

            for (const track of tracks.slice(1)) {
                track.requestedBy = interaction.user
                if (playNext) queue.insertTrack(track, position++)
                else queue.addTrack(track)
            }

            moveUserTrackToPriority(queue, playResult.track)

            const albumTitle = searchResult.playlist?.title ?? query

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            `💿 ${albumTitle}`,
                            `Queued **${tracks.length}** track${tracks.length === 1 ? '' : 's'} from **${albumTitle}**.${shuffle ? ' Shuffled.' : ''}${playNext ? ' Playing next.' : ''}`,
                        ),
                    ],
                },
            })
        } catch (error) {
            if (isUnknownInteractionError(error)) return
            errorLog({
                message: 'Album command error:',
                error,
                data: { query, guildId: interaction.guildId },
            })
            try {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                createUserFriendlyError(error),
                            ),
                        ],
                        ephemeral: true,
                    },
                })
            } catch {
                // interaction already replied
            }
        }
    },
})
