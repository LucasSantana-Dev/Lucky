import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import type { CommandExecuteParams } from "../../../types/CommandData"
import {
    requireQueue,
    requireVoiceChannel,
} from "../../../utils/command/commandValidations"
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { createSuccessEmbed, createErrorEmbed } from '../../../utils/general/embeds'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('skipto')
        .setDescription('⏭️ Skip to a track in the queue by position.')
        .addIntegerOption((option) =>
            option
                .setName('position')
                .setDescription('Position in queue (1 is next track)')
                .setRequired(true)
                .setMinValue(1),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireVoiceChannel(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return

        const position = interaction.options.getInteger('position', true)
        const queueSize = queue?.tracks.size ?? 0

        if (position > queueSize + 1) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Invalid position',
                            `Queue has ${queueSize} tracks. Position must be between 1 and ${queueSize + 1}.`,
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const targetIndex = position - 1
        queue?.node.skipTo(targetIndex)

        const targetTrack = queue?.tracks.toArray?.()?.[targetIndex]
        if (!targetTrack) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            '⏭️ Skipped',
                            `Skipped to position ${position}.`,
                        ),
                    ],
                },
            })
            return
        }

        const trackEmbed = buildCommandTrackEmbed(targetTrack, `⏭️ Now playing (position ${position})`, interaction.user)
        await interactionReply({ interaction, content: { embeds: [trackEmbed] } })
    },
})
