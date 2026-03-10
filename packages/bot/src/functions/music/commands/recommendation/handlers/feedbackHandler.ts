import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import {
    errorEmbed,
    successEmbed,
    warningEmbed,
} from '../../../../../utils/general/embeds'
import { recommendationFeedbackService } from '../../../../../services/musicRecommendation/feedbackService'
import type { CustomClient } from '../../../../../types'

export async function handleFeedback(
    interaction: ChatInputCommandInteraction,
    client: CustomClient,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed(
                        'Error',
                        'This command can only be used in a server!',
                    ),
                ],
            },
        })
        return
    }

    const feedback = interaction.options.getString('feedback', true) as
        | 'like'
        | 'dislike'
    const trackUrl = interaction.options.getString('track_url')
    const queue = client.player.nodes.get(guildId)
    const currentTrack = queue?.currentTrack

    if (!trackUrl && !currentTrack) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    warningEmbed(
                        'No Track',
                        'No current track found. Provide `track_url` to leave feedback.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const trackKey =
        currentTrack && (!trackUrl || currentTrack.url === trackUrl)
            ? recommendationFeedbackService.buildTrackKey(
                  currentTrack.title,
                  currentTrack.author,
              )
            : recommendationFeedbackService.buildTrackKey(
                  trackUrl ?? 'unknown-track',
                  'url',
              )

    await recommendationFeedbackService.setFeedback(
        guildId,
        interaction.user.id,
        trackKey,
        feedback,
    )

    await interactionReply({
        interaction,
        content: {
            embeds: [
                successEmbed(
                    'Feedback saved',
                    `Stored **${feedback}** feedback for this recommendation profile.`,
                ),
            ],
            ephemeral: true,
        },
    })
}
