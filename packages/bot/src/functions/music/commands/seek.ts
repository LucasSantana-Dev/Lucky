import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import type { CommandExecuteParams } from "../../../types/CommandData"
import {
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
    requireVoiceChannel,
} from "../../../utils/command/commandValidations"
import { requireDJRole } from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { createSuccessEmbed, createErrorEmbed } from '../../../utils/general/embeds'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'

function parseTimeToMs(timeStr: string): number | null {
    const parts = timeStr.split(':')

    if (parts.length === 1) {
        const seconds = parseInt(parts[0], 10)
        return !isNaN(seconds) && seconds >= 0 ? seconds * 1000 : null
    }

    if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10)
        const seconds = parseInt(parts[1], 10)
        return !isNaN(minutes) && !isNaN(seconds) && minutes >= 0 && seconds >= 0 && seconds < 60
            ? (minutes * 60 + seconds) * 1000
            : null
    }

    return null
}

function formatMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('⏩ Seek to a position in the current track.')
        .addStringOption((option) =>
            option
                .setName('time')
                .setDescription('Time to seek to (mm:ss or ss format)')
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireVoiceChannel(interaction))) return
        if (!(await requireDJRole(interaction, interaction.guildId!))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        const timeStr = interaction.options.getString('time', true)
        const targetMs = parseTimeToMs(timeStr)

        if (targetMs === null) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Invalid time format',
                            'Please use mm:ss or ss format (e.g., "1:30" or "90")',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const currentTrack = queue?.currentTrack
        if (!currentTrack?.durationMS) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Cannot seek',
                            'This track does not support seeking.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (targetMs > currentTrack.durationMS) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Time out of range',
                            `Track duration is ${formatMs(currentTrack.durationMS)}`,
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        queue?.node.seek(targetMs)

        const formattedTime = formatMs(targetMs)
        const trackEmbed = buildCommandTrackEmbed(currentTrack, `⏩ Seeked to ${formattedTime}`, interaction.user)
        await interactionReply({ interaction, content: { embeds: [trackEmbed] } })
    },
})
