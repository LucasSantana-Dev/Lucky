import { SlashCommandBuilder } from '@discordjs/builders'
import { debugLog, errorLog } from '@lucky/shared/utils'
import Command from '../../../../models/Command'
import {
    requireGuild,
    requireQueue,
} from '../../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../../types/CommandData'
import { createQueueEmbed, createQueueErrorEmbed } from './queueEmbed'
import {
    createErrorEmbed,
    successEmbed,
    warningEmbed,
} from '../../../../utils/general/embeds'
import { interactionReply } from '../../../../utils/general/interactionReply'
import {
    smartShuffleQueue,
    rescueQueue,
} from '../../../../utils/music/queueManipulation'
import { resolveGuildQueue } from '../../../../utils/music/queueResolver'

type QueueAction = 'show' | 'smartshuffle' | 'rescue'

function resolveAction(rawAction: string | null): QueueAction {
    if (rawAction === 'smartshuffle') return 'smartshuffle'
    if (rawAction === 'rescue') return 'rescue'
    return 'show'
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('📋 Show and manage the current music queue')
        .addStringOption((option) =>
            option
                .setName('action')
                .setDescription('Queue action to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Show queue', value: 'show' },
                    { name: 'Smart shuffle', value: 'smartshuffle' },
                    { name: 'Rescue queue', value: 'rescue' },
                ),
        ),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return

        try {
            const action = resolveAction(
                interaction.options.getString('action'),
            )

            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [createErrorEmbed('Error', 'No queue found')],
                    },
                })
                return
            }

            if (action === 'smartshuffle') {
                if (queue.tracks.size < 2) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                warningEmbed(
                                    'Queue too short',
                                    'Need at least 2 queued tracks for smart shuffle.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                const shuffled = await smartShuffleQueue(queue)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            shuffled
                                ? successEmbed(
                                      'Smart shuffle complete',
                                      'Queue reordered with requester fairness and momentum.',
                                  )
                                : createErrorEmbed(
                                      'Error',
                                      'Failed to smart-shuffle the queue.',
                                  ),
                        ],
                    },
                })
                return
            }

            if (action === 'rescue') {
                const result = await rescueQueue(queue, { probeResolvable: true })
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            successEmbed(
                                'Queue rescue complete',
                                `Removed ${result.removedTracks} broken track(s), kept ${result.keptTracks}, and added ${result.addedTracks} autoplay refill track(s).`,
                            ),
                        ],
                    },
                })
                return
            }

            debugLog({
                message: 'Queue status',
                data: { queueExists: !!queue },
            })

            const { embed, components } =
                await createQueueEmbed(queue)

            await interactionReply({
                interaction,
                content: {
                    embeds: [embed],
                    components,
                },
            })
        } catch (error) {
            errorLog({
                message: 'Error in queue command',
                error,
            })

            const errorEmbed = createQueueErrorEmbed(
                'Failed to retrieve queue information. Please try again.',
            )

            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed],
                },
            })
        }
    },
})
