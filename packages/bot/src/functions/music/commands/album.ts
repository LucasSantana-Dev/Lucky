import { SlashCommandBuilder } from '@discordjs/builders'
import { QueryType } from 'discord-player'
import type { GuildMember } from 'discord.js'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { moveUserTrackToPriority } from '../../../utils/music/queueManipulation'
import {
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
} from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'
import { errorLog } from '@lucky/shared/utils'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { assertDefined } from '@lucky/shared/utils/guards'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { featureToggleService } from '@lucky/shared/services'
import { isUnknownInteractionError } from './play/queryUtils'

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
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('artist')
                .setDescription('Artist name to narrow the search (optional)')
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

        const isEnabled = await featureToggleService.isEnabled('ALBUM_COMMAND', {
            guildId: interaction.guildId,
        })
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

        const voiceChannel = assertDefined(member.voice.channel, 'voice channel present after requireVoiceChannel guard')
        const query = interaction.options.getString('query', true)
        const artistFilter = interaction.options.getString('artist')

        try {
            await interaction.deferReply()
        } catch (error) {
            if (isUnknownInteractionError(error)) return
            throw error
        }

        try {
            const isUrl = isSpotifyAlbumUrl(query)
            const searchEngine = isUrl
                ? QueryType.AUTO
                : QueryType.SPOTIFY_SEARCH
            const searchQuery =
                !isUrl && artistFilter ? `${query} ${artistFilter}` : query

            const searchResult = await client.player.search(searchQuery, {
                requestedBy: interaction.user,
                searchEngine,
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
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'No album found',
                                'Please provide a Spotify album URL or a more specific album search.',
                            ),
                        ],
                    },
                })
                return
            }

            const tracks = searchResult.tracks
            const firstTrack = tracks[0]

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
                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 30_000,
                        leaveOnEnd: true,
                        leaveOnEndCooldown: 300_000,
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

            for (const track of tracks.slice(1)) {
                track.requestedBy = interaction.user
                queue.addTrack(track)
            }

            moveUserTrackToPriority(queue, playResult.track)

            const albumTitle = searchResult.playlist?.title ?? query

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            `💿 ${albumTitle}`,
                            `Queued **${tracks.length}** track${tracks.length === 1 ? '' : 's'} from **${albumTitle}**.`,
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
