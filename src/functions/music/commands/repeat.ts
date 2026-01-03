import { SlashCommandBuilder } from '@discordjs/builders'
import { QueueRepeatMode } from 'discord-player'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { successEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireQueue } from '../../../utils/command/commandValidations'

/**
 * Handle track repeat mode
 */
function handleTrackRepeat(
    times: number | null,
    guildId: string,
): { mode: QueueRepeatMode; description: string } {
    const repeatMode = QueueRepeatMode.TRACK
    if (times !== null && times !== undefined && times > 1) {
        guildRepeatCounts.set(guildId, {
            count: times,
            originalMode: repeatMode,
        })
        return {
            mode: repeatMode,
            description: `Repeating current song **${times} times**`,
        }
    } else {
        return {
            mode: repeatMode,
            description: 'Repeating current song **infinitely**',
        }
    }
}

/**
 * Handle queue repeat mode
 */
function handleQueueRepeat(
    times: number | null,
    guildId: string,
): { mode: QueueRepeatMode; description: string } {
    const repeatMode = QueueRepeatMode.QUEUE
    if (times !== null && times !== undefined && times > 1) {
        guildRepeatCounts.set(guildId, {
            count: times,
            originalMode: repeatMode,
        })
        return {
            mode: repeatMode,
            description: `Repeating queue **${times} times**`,
        }
    } else {
        return {
            mode: repeatMode,
            description: 'Repeating queue **infinitely**',
        }
    }
}

/**
 * Get repeat mode configuration
 */
function getRepeatModeConfig(
    mode: string,
    times: number | null,
    guildId: string,
): { mode: QueueRepeatMode; description: string } {
    switch (mode) {
        case 'off':
            return {
                mode: QueueRepeatMode.OFF,
                description: 'Repeat **turned off**',
            }
        case 'track':
            return handleTrackRepeat(times, guildId)
        case 'queue':
            return handleQueueRepeat(times, guildId)
        case 'infinite':
            return {
                mode: QueueRepeatMode.AUTOPLAY,
                description:
                    '**Infinite** repeat activated (continuous autoplay)',
            }
        default:
            return {
                mode: QueueRepeatMode.OFF,
                description: 'Repeat **turned off**',
            }
    }
}

// Store repeat counts for each guild
const guildRepeatCounts = new Map<
    string,
    { count: number; originalMode: QueueRepeatMode }
>()

export default new Command({
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('🔁 Set the repeat mode with time or infinite options.')
        .addStringOption((option) =>
            option
                .setName('mode')
                .setDescription('Repeat type')
                .setRequired(true)
                .addChoices(
                    { name: 'off - Turn off', value: 'off' },
                    { name: 'track - Repeat current song', value: 'track' },
                    { name: 'queue - Repeat queue', value: 'queue' },
                    {
                        name: 'infinite - Repeat infinitely',
                        value: 'infinite',
                    },
                ),
        )
        .addIntegerOption((option) =>
            option
                .setName('times')
                .setDescription(
                    'Number of times to repeat (1-100, only for track/queue)',
                )
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const queue = client.player.nodes.get(interaction.guildId ?? '')
        const mode = interaction.options.getString('mode', true)
        const times = interaction.options.getInteger('times', false)

        if (!(await requireQueue(queue, interaction))) return

        const guildId = interaction.guildId ?? ''

        // Clear any existing repeat count
        guildRepeatCounts.delete(guildId)

        const { mode: repeatMode, description } = getRepeatModeConfig(
            mode,
            times,
            guildId,
        )

        queue?.setRepeatMode(repeatMode)

        await interactionReply({
            interaction,
            content: {
                embeds: [successEmbed('🔁 Repeat mode', description)],
            },
        })
    },
})

export { guildRepeatCounts }
