import { SlashCommandBuilder } from '@discordjs/builders'
import { interactionReply } from '../../../utils/general/interactionReply'
import Command from '../../../../packages/bot/src/models/Command'
import {
    createEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../utils/general/embeds'
import {
    requireGuild,
    requireQueue,
} from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    formatCurrentTrackEmbed,
    formatManualTracksList,
    formatAutoplayTracksList,
    formatRemainingTracks,
    formatQueueStatistics,
    createQueueEmbed,
    type FormattedQueueData,
} from './queue/queueFormatter'
import { groupQueueTracks } from '../../../../packages/bot/src/functions/music/commands/queue/queueGrouping'
import type { CustomClient } from '../../../../packages/bot/src/types'
import { messages } from '../../../utils/general/messages'
import type { ColorResolvable } from 'discord.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('📋 Show the current music queue'),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return

        try {
            const embed = createQueueEmbed()

            try {
                const currentTrackField = formatCurrentTrackEmbed(queue, client as CustomClient)
                embed.addFields(currentTrackField)
            } catch (currentTrackError) {
                embed.addFields({
                    name: '▶️ Now Playing',
                    value: messages.error.noTrack,
                })
            }

            try {
                const queueData = groupQueueTracks(queue, client as CustomClient)

                if (queueData.manualTracks.length > 0) {
                    const manualList = formatManualTracksList(
                        queueData.manualTracks,
                        client as CustomClient,
                    )
                    if (manualList) {
                        embed.addFields({
                            name: '👤 Manual Songs (Priority)',
                            value: manualList,
                        })
                    }
                }

                if (queueData.autoplayTracks.length > 0) {
                    const autoplayList = formatAutoplayTracksList(
                        queueData.autoplayTracks,
                        client as CustomClient,
                    )
                    if (autoplayList) {
                        embed.addFields({
                            name: '🤖 Autoplay Songs',
                            value: autoplayList,
                        })
                    }
                }

                if (queueData.totalTracks > 0) {
                    const remainingText = formatRemainingTracks(
                        queueData.manualTracks,
                        queueData.autoplayTracks,
                    )
                    if (remainingText) {
                        embed.addFields({
                            name: '📝 More songs',
                            value: remainingText,
                        })
                    }
                } else {
                    embed.addFields({
                        name: '📑 Next Songs',
                        value: 'No songs in the queue',
                    })
                }

                try {
                    const statsField = formatQueueStatistics(queue, queueData)
                    embed.addFields(statsField)
                } catch (statsError) {
                    // Stats error handled silently
                }
            } catch (tracksError) {
                embed.addFields({
                    name: '📑 Next Songs',
                    value: messages.error.noTrack,
                })
            }

            embed.setTimestamp()

            await interactionReply({
                interaction,
                content: {
                    embeds: [embed],
                },
            })
        } catch (error) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createEmbed({
                            title: 'Error',
                            description: messages.error.noQueue,
                            color: EMBED_COLORS.ERROR as ColorResolvable,
                            emoji: EMOJIS.ERROR,
                        }),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
