import { SlashCommandBuilder } from '@discordjs/builders'
import { MessageFlags } from 'discord.js'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireGuild,
    voiceChannelRefusal,
} from '../../../utils/command/commandValidations'
import { translatorForInteraction } from '../../../i18n/translatorForInteraction'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { recommendationFeedbackService } from '../../../services/musicRecommendation/feedbackService'
import { LIKED_TRACKS_MAX, likeTrack } from '../../../services/likedTracks'

/**
 * Saves the playing song to the member's own liked songs, which `/liked`
 * lists and plays back in any guild. The answer is only shown to them.
 */
export default new Command({
    data: new SlashCommandBuilder()
        .setName('like')
        .setDescription('❤️ Save the playing song to your liked songs'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guildId = interaction.guildId
        if (!guildId) return
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const t = await translatorForInteraction(interaction)
        const reply = (content: string) =>
            interactionReply({
                interaction,
                content: { content, ephemeral: true },
            })

        const { queue } = resolveGuildQueue(client, guildId)
        const track = queue?.currentTrack
        if (!queue || !track) {
            await reply(t('music.liked.nothingPlaying'))
            return
        }

        const result = await likeTrack(interaction.user.id, track)
        // A like also tells autoplay in this guild what the member wants more
        // of, when they are listening with the bot: ratings stay with
        // listeners. The list is shared across guilds and the vote is not, so
        // a song liked elsewhere still votes here.
        const trackKey = recommendationFeedbackService.buildTrackKey(
            track.title,
            track.author,
        )
        const listening =
            voiceChannelRefusal(interaction, queue, {
                allowManagers: false,
            }) === null
        if (
            (result === 'saved' || result === 'already') &&
            listening &&
            trackKey !== '::'
        ) {
            // Best effort: setFeedback logs and swallows a failure.
            void recommendationFeedbackService.setFeedback(
                guildId,
                interaction.user.id,
                interaction.user.username,
                trackKey,
                'like',
            )
        }
        await reply(
            t(`music.liked.${result}`, {
                title: track.title,
                max: LIKED_TRACKS_MAX,
            }),
        )
    },
})
