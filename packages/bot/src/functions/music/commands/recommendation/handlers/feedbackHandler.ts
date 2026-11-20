import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import {
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
} from '../../../../../utils/general/embeds'
import { recommendationFeedbackService } from '../../../../../services/musicRecommendation/feedbackService'
import type { CustomClient } from '../../../../../types'
import { resolveGuildQueue } from '../../../../../services/musicManagement/queueResolver'
import { parseYoutubeLink } from '../../play/queryDetector'

function sameTrackUrl(a: string, b: string): boolean {
    if (a === b) return true
    const first = parseYoutubeLink(a)
    const second = parseYoutubeLink(b)
    return (
        first?.kind === 'video' &&
        second?.kind === 'video' &&
        first.videoId === second.videoId
    )
}

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
                    createErrorEmbed(
                        'Error',
                        'This command can only be used in a server!',
                    ),
                ],
            },
        })
        return
    }

    const feedback = interaction.options.getString('feedback', true) as
        'like' | 'dislike'
    const trackUrl = interaction.options.getString('track_url')
    const { queue } = resolveGuildQueue(client, guildId)
    const currentTrack = queue?.currentTrack

    const ratesCurrentTrack =
        currentTrack && (!trackUrl || sameTrackUrl(currentTrack.url, trackUrl))

    if (!ratesCurrentTrack) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createWarningEmbed(
                        'No Track',
                        currentTrack
                            ? 'Feedback only applies to the track that is playing now.'
                            : 'No current track found. Play a track to leave feedback.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const saved = await recommendationFeedbackService.setFeedback(
        guildId,
        interaction.user.id,
        interaction.user.username,
        recommendationFeedbackService.buildTrackKey(
            currentTrack.title,
            currentTrack.author,
        ),
        feedback,
    )

    if (!saved) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Feedback not saved',
                        'Could not store your feedback. Please try again.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createSuccessEmbed(
                    'Feedback saved',
                    `Stored **${feedback}** feedback for this recommendation profile.`,
                ),
            ],
            ephemeral: true,
        },
    })
}
