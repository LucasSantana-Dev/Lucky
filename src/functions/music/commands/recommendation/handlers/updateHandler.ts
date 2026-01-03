import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { errorEmbed, successEmbed } from '../../../../../utils/general/embeds'
import { recommendationConfigService } from '../../../../../services/RecommendationConfigService'

/**
 * Handle updating recommendation settings
 */
export async function handleUpdateSettings(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    try {
        const guildId = interaction.guildId
        if (!guildId) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'This command can only be used in a server!')],
                },
            })
            return
        }

        const enabled = interaction.options.getBoolean('enabled')
        const maxRecommendations = interaction.options.getInteger('max_recommendations')
        const similarityThreshold = interaction.options.getNumber('similarity_threshold')
        const genreWeight = interaction.options.getNumber('genre_weight')
        const tagWeight = interaction.options.getNumber('tag_weight')
        const artistWeight = interaction.options.getNumber('artist_weight')
        const learningEnabled = interaction.options.getBoolean('learning_enabled')

        const updates: {
            enabled?: boolean
            maxRecommendations?: number
            similarityThreshold?: number
            genreWeight?: number
            tagWeight?: number
            artistWeight?: number
            learningEnabled?: boolean
        } = {}

        if (enabled !== null) updates.enabled = enabled
        if (maxRecommendations !== null) updates.maxRecommendations = maxRecommendations
        if (similarityThreshold !== null) updates.similarityThreshold = similarityThreshold
        if (genreWeight !== null) updates.genreWeight = genreWeight
        if (tagWeight !== null) updates.tagWeight = tagWeight
        if (artistWeight !== null) updates.artistWeight = artistWeight
        if (learningEnabled !== null) updates.learningEnabled = learningEnabled

        if (Object.keys(updates).length === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'No valid settings provided to update.')],
                },
            })
            return
        }

        await recommendationConfigService.updateSettings(guildId, updates)

        const updatedFields = Object.keys(updates)
            .map(key => `• ${key}: ${updates[key as keyof typeof updates]}`)
            .join('\n')

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        'Settings Updated',
                        `Successfully updated the following settings:\n${updatedFields}`,
                    ),
                ],
            },
        })
    } catch (_error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', 'Failed to update settings.')],
            },
        })
    }
}
