import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import type { CommandExecuteParams } from "../../../types/CommandData"
import {
    requireQueue,
    requireVoiceChannel,
} from "../../../utils/command/commandValidations"
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { createSuccessEmbed, createWarningEmbed } from '../../../utils/general/embeds'
import { buildTrackEmbed, trackToData } from '../../../utils/general/responseEmbeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('⏸️ Pause the current music.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireVoiceChannel(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return

        if (queue?.node.isPaused() === true) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createWarningEmbed(
                            'Already paused',
                            '⏸️ Music is already paused.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        queue?.node.pause()

        const currentTrack = queue?.currentTrack
        if (!currentTrack) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            '⏸️ Paused',
                            'Music has been paused.',
                        ),
                    ],
                },
            })
            return
        }

        // Build a rich embed showing the paused track
        const trackData = trackToData(currentTrack)
        const trackEmbed = buildTrackEmbed(trackData, 'playing', {
            tag: interaction.user.username,
            displayAvatarURL: interaction.user.displayAvatarURL,
        })
        trackEmbed.setAuthor({ name: '⏸️ Paused' })

        await interactionReply({
            interaction,
            content: {
                embeds: [trackEmbed],
            },
        })
    },
})
