import { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildMember, ChatInputCommandInteraction } from 'discord.js'
import { requireVoiceChannel } from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import Command from '../../../models/Command'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createUserFriendlyError } from '../../../utils/general/errorSanitizer'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { buildPlayResponseEmbed } from '../../../utils/music/nowPlayingEmbed'
import { createMusicControlButtons } from '../../../utils/music/buttonComponents'
import {
    isUnknownInteractionError,
    isUrl,
    resolveSearchEngine,
} from './play/queryUtils'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('playskip')
        .setDescription(
            'Add a track to the top of the queue and skip the current track',
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
                queue.node.skip()
            }

            const embed = buildPlayResponseEmbed({
                kind: 'nowPlaying',
                track,
                requestedBy: interaction.user,
            })

            const components = [createMusicControlButtons(queue)]

            await interactionReply({
                interaction,
                content: { embeds: [embed], components },
            })

            debugLog({
                message: 'Track added to top and current skipped',
                data: { query, guildId: interaction.guildId },
            })
        } catch (error) {
            if (isUnknownInteractionError(error)) {
                debugLog({
                    message: 'Playskip command interaction expired before reply',
                    data: { query, guildId: interaction.guildId },
                })
                return
            }

            errorLog({
                message: 'Playskip command error:',
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
                    message: 'Failed to send playskip command error reply',
                    error: replyError,
                    data: { guildId: interaction.guildId },
                })
            }
        }
    },
})
