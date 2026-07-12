import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { assertDefined } from '@lucky/shared/utils/guards'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    buildTrackEmbed,
    trackToData,
} from '../../../utils/general/responseEmbeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireQueue,
    requireCurrentTrack,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('songinfo')
        .setDescription(
            '🎶 Mostra informações da música que está tocando agora.',
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        const track = queue?.currentTrack

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        const trackData = trackToData(
            assertDefined(
                track,
                'track present after requireCurrentTrack guard',
            ),
        )
        // Snapshot the current playback position as a progress bar with
        // elapsed/total timecodes. Null for livestreams / no-duration tracks.
        const progressBar =
            queue?.node.createProgressBar({ length: 18, timecodes: true }) ??
            null
        const embed = buildTrackEmbed(
            trackData,
            'playing',
            {
                tag: interaction.user.username,
                displayAvatarURL: interaction.user.displayAvatarURL,
            },
            { progressBar },
        )

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    },
})
