import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { errorEmbed, createEmbed, EMBED_COLORS, EMOJIS } from '../../../../../utils/general/embeds'
import { recommendationConfigService } from '../../../../../services/RecommendationConfigService'

/**
 * Handle applying recommendation presets
 */
export async function handleApplyPreset(
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

        const preset = interaction.options.getString('preset', true)

        const presets = {
            balanced: {
                enabled: true,
                maxRecommendations: 5,
                similarityThreshold: 0.7,
                genreWeight: 0.4,
                tagWeight: 0.3,
                artistWeight: 0.2,
                learningEnabled: true,
            },
            conservative: {
                enabled: true,
                maxRecommendations: 3,
                similarityThreshold: 0.8,
                genreWeight: 0.5,
                tagWeight: 0.2,
                artistWeight: 0.3,
                learningEnabled: false,
            },
            experimental: {
                enabled: true,
                maxRecommendations: 8,
                similarityThreshold: 0.5,
                genreWeight: 0.3,
                tagWeight: 0.4,
                artistWeight: 0.1,
                learningEnabled: true,
            },
            disabled: {
                enabled: false,
                maxRecommendations: 0,
                similarityThreshold: 0.0,
                genreWeight: 0.0,
                tagWeight: 0.0,
                artistWeight: 0.0,
                learningEnabled: false,
            },
        }

        const selectedPreset = presets[preset as keyof typeof presets]
        if (!selectedPreset) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'Invalid preset selected.')],
                },
            })
            return
        }

        await recommendationConfigService.updateSettings(guildId, selectedPreset)

        const embed = createEmbed({
            title: `${EMOJIS.SUCCESS} Preset Applied`,
            description: `Successfully applied the **${preset}** preset.`,
            color: EMBED_COLORS.SUCCESS,
            fields: [
                {
                    name: 'Settings Applied',
                    value: Object.entries(selectedPreset)
                        .map(([key, value]) => `• ${key}: ${value}`)
                        .join('\n'),
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
                embeds: [errorEmbed('Error', 'Failed to apply preset.')],
            },
        })
    }
}
