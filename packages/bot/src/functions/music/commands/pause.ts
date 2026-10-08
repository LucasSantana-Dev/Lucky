import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireQueue,
    requireVoiceChannel,
} from '../../../utils/command/commandValidations'
import {
    captureAutoplayTrack,
    maybePromptAutoplayFeedback,
} from '../../../services/musicRecommendation/autoplayFeedbackPrompt'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { createSuccessEmbed } from '../../../utils/general/embeds'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('⏸️ Toggle pause/resume music.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireVoiceChannel(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return

        const isPaused = queue?.node.isPaused() === true

        if (isPaused) {
            queue?.node.resume()
        } else {
            queue?.node.pause()
        }

        const currentTrack = queue?.currentTrack
        // Only a pause asks; resuming means the song was fine.
        const pausedAutoplay = isPaused
            ? null
            : captureAutoplayTrack(currentTrack)
        const action = isPaused ? '▶️ Resumed' : '⏸️ Paused'

        if (!currentTrack) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            action,
                            `Music has been ${isPaused ? 'resumed' : 'paused'}.`,
                        ),
                    ],
                },
            })
            await maybePromptAutoplayFeedback(interaction, pausedAutoplay)
            return
        }

        const trackEmbed = buildCommandTrackEmbed(
            currentTrack,
            action,
            interaction.user,
        )
        await interactionReply({
            interaction,
            content: { embeds: [trackEmbed] },
        })
        await maybePromptAutoplayFeedback(interaction, pausedAutoplay)
    },
})
