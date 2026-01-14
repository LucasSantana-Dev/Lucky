import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { errorEmbed, successEmbed } from '../../../../../utils/general/embeds'

const recommendationConfigService = {
    updateSettings: async (_guildId: string, _settings: unknown): Promise<void> => {},
}

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

        const updates: Record<string, unknown> = {}

        const enabled = interaction.options.getBoolean('enabled')
        if (enabled !== null) updates.enabled = enabled

        const maxRecommendations = interaction.options.getInteger('max_recommendations')
        if (maxRecommendations !== null) updates.maxRecommendations = maxRecommendations

        const similarityThreshold = interaction.options.getNumber('similarity_threshold')
        if (similarityThreshold !== null) updates.similarityThreshold = similarityThreshold

        const genreWeight = interaction.options.getNumber('genre_weight')
        if (genreWeight !== null) updates.genreWeight = genreWeight

        const tagWeight = interaction.options.getNumber('tag_weight')
        if (tagWeight !== null) updates.tagWeight = tagWeight

        const artistWeight = interaction.options.getNumber('artist_weight')
        if (artistWeight !== null) updates.artistWeight = artistWeight

        const learningEnabled = interaction.options.getBoolean('learning_enabled')
        if (learningEnabled !== null) updates.learningEnabled = learningEnabled

        if (Object.keys(updates).length === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'No settings provided to update.')],
                },
            })
            return
        }

        await recommendationConfigService.updateSettings(guildId, updates)

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        'Settings Updated',
                        'Recommendation settings have been updated successfully.',
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
