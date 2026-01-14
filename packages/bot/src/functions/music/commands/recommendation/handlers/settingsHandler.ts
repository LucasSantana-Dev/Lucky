import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { errorEmbed, createEmbed, EMBED_COLORS, EMOJIS } from '../../../../../utils/general/embeds'
import { getAutoplayStats } from '../../../../../utils/music/autoplayManager'

const recommendationConfigService = {
    getSettings: async (_guildId: string) => ({
        enabled: false,
        maxRecommendations: 0,
        similarityThreshold: 0,
        genreWeight: 0,
        tagWeight: 0,
        artistWeight: 0,
        learningEnabled: false,
    }),
}

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
                    name: 'General Settings',
                    value: `Enabled: ${settings.enabled ? 'Yes' : 'No'}\nMax Recommendations: ${settings.maxRecommendations}\nLearning Enabled: ${settings.learningEnabled ? 'Yes' : 'No'}`,
                    inline: false,
                },
                {
                    name: 'Similarity Settings',
                    value: `Threshold: ${settings.similarityThreshold}\nGenre Weight: ${settings.genreWeight}\nTag Weight: ${settings.tagWeight}\nArtist Weight: ${settings.artistWeight}`,
                    inline: false,
                },
                {
                    name: 'Autoplay Statistics',
                    value: `Total: ${autoplayStats.total}\nThis Week: ${autoplayStats.thisWeek}\nThis Month: ${autoplayStats.thisMonth}\nAverage Per Day: ${autoplayStats.averagePerDay.toFixed(2)}`,
                    inline: false,
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
