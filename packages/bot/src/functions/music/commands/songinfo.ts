import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import { buildTrackEmbed, trackToData } from '../../../utils/general/responseEmbeds'
import type { CommandExecuteParams } from "../../../types/CommandData"
import {
    requireQueue,
    requireCurrentTrack,
} from "../../../utils/command/commandValidations"
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

        const trackData = trackToData(track!)
        
        // Determine if autoplay is enabled by checking if there are autoplay tracks in the queue
        const hasAutoplayTracks = queue!.tracks.some((t) => Boolean((t.metadata as { isAutoplay?: boolean })?.isAutoplay))
        
        const embed = buildTrackEmbed(trackData, 'playing', {
            tag: interaction.user.username,
            displayAvatarURL: interaction.user.displayAvatarURL,
        }, {
            totalTracks: queue!.tracks.size,
            autoplayEnabled: hasAutoplayTracks,
        })

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    },
})
