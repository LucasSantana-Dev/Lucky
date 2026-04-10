import { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildMember, ChatInputCommandInteraction } from 'discord.js'
import { requireVoiceChannel } from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { CustomClient } from '../../../types'
import Command from '../../../models/Command'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createUserFriendlyError } from '../../../utils/general/errorSanitizer'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { buildPlayResponseEmbed } from '../../../utils/music/nowPlayingEmbed'
import { createMusicControlButtons } from '../../../utils/music/buttonComponents'
import { QueryType } from 'discord-player'

const DISCORD_UNKNOWN_INTERACTION_CODE = 10062

function isUnknownInteractionError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === DISCORD_UNKNOWN_INTERACTION_CODE
    )
}

function isUrl(query: string): boolean {
    return query.startsWith('http://') || query.startsWith('https://')
}

function resolveSearchEngine(query: string): QueryType {
    if (isUrl(query)) return QueryType.AUTO
    return QueryType.SPOTIFY_SEARCH
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('playtop')
        .setDescription(
            'Add a track to the top of the queue (plays next)',
        )
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription(
                    'Song name, artist, YouTube URL, or Spotify URL',
                )
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!interaction.guildId) {
            await interaction.reply({
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'This command can only be used in a server',
                    ),
                ],
                ephemeral: true,
            })
            return
        }

        const member = interaction.member as GuildMember
        if (!(await requireVoiceChannel(interaction))) return

        const voiceChannel = member.voice.channel!

        try {
            await interaction.deferReply()
        } catch (error) {
            if (isUnknownInteractionError(error)) return
            throw error
        }

        const query = interaction.options.getString('query', true)

        try {
            const searchEngine = resolveSearchEngine(query)
            let result = await client.player.play(voiceChannel, query, {
                searchEngine,
            })

            const track = result.track
            const { queue } = resolveGuildQueue(
                client,
                interaction.guildId ?? '',
            )

            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Could not create queue',
                            ),
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
            }

            const embed = buildPlayResponseEmbed({
                kind: 'addedToQueue',
                track,
                requestedBy: interaction.user,
                queuePosition: 1,
            })

            const components = [createMusicControlButtons(queue)]

            await interactionReply({
                interaction,
                content: { embeds: [embed], components },
            })

            debugLog({
                message: 'Track added to top of queue',
                data: { query, guildId: interaction.guildId },
            })
        } catch (error) {
            if (isUnknownInteractionError(error)) {
                debugLog({
                    message: 'Playtop command interaction expired before reply',
                    data: { query, guildId: interaction.guildId },
                })
                return
            }

            errorLog({
                message: 'Playtop command error:',
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
                    message: 'Failed to send playtop command error reply',
                    error: replyError,
                    data: { guildId: interaction.guildId },
                })
            }
        }
    },
})
