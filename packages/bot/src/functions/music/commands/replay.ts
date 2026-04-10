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
import { createSuccessEmbed } from '../../../utils/general/embeds'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('replay')
        .setDescription('🔄 Replay the current song from the beginning.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireVoiceChannel(interaction))) return
        if (!(await requireDJRole(interaction, interaction.guildId!))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        queue?.node.seek(0)

        const currentTrack = queue?.currentTrack
        if (!currentTrack) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            '🔄 Replayed',
                            'Track has been replayed from the beginning.',
                        ),
                    ],
                },
            })
            return
        }

        const trackEmbed = buildCommandTrackEmbed(currentTrack, '🔄 Replayed', interaction.user)
        await interactionReply({ interaction, content: { embeds: [trackEmbed] } })
    },
})
