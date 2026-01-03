import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { errorEmbed, createEmbed, EMBED_COLORS, EMOJIS } from '../../../../../utils/general/embeds'
import { recommendationConfigService } from '../../../../../services/RecommendationConfigService'

/**
 * Handle showing current recommendation settings
 */
export async function handleShowSettings(
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

        const settings = await recommendationConfigService.getSettings(guildId)
        const autoplayStats = await getAutoplayStats(guildId)

        const embed = createEmbed({
            title: `${EMOJIS.SETTINGS} Recommendation Settings`,
            description: 'Current recommendation configuration for this server.',
            color: EMBED_COLORS.INFO,
            fields: [
                {
                    name: 'Status',
                    value: settings.enabled ? '✅ Enabled' : '❌ Disabled',
                    inline: true,
                },
                {
                    name: 'Max Recommendations',
                    value: settings.maxRecommendations.toString(),
                    inline: true,
                },
                {
                    name: 'Similarity Threshold',
                    value: settings.similarityThreshold.toString(),
                    inline: true,
                },
                {
                    name: 'Genre Weight',
                    value: settings.genreWeight.toString(),
                    inline: true,
                },
                {
                    name: 'Tag Weight',
                    value: settings.tagWeight.toString(),
                    inline: true,
                },
                {
                    name: 'Artist Weight',
                    value: settings.artistWeight.toString(),
                    inline: true,
                },
                {
                    name: 'Learning Enabled',
                    value: settings.learningEnabled ? '✅ Yes' : '❌ No',
                    inline: true,
                },
                {
                    name: 'Autoplay Stats',
                    value: `Total: ${autoplayStats.total}\nThis week: ${autoplayStats.thisWeek}`,
                    inline: true,
                },
            ],
        })

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    } catch (_error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', 'Failed to retrieve settings.')],
            },
        })
    }
}

import { getAutoplayStats } from '../../../../../utils/music/autoplayManager'
