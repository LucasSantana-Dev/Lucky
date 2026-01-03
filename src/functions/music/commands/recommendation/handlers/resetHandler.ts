import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { errorEmbed, successEmbed } from '../../../../../utils/general/embeds'
import { recommendationConfigService } from '../../../../../services/RecommendationConfigService'

/**
 * Handle resetting recommendation settings to defaults
 */
export async function handleResetSettings(
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

        const confirm = interaction.options.getBoolean('confirm', true)
        if (!confirm) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [errorEmbed('Error', 'Reset cancelled. You must confirm the reset.')],
                },
            })
            return
        }

        await recommendationConfigService.resetSettings(guildId)

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    successEmbed(
                        'Settings Reset',
                        'All recommendation settings have been reset to their default values.',
                    ),
                ],
            },
        })
    } catch (_error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', 'Failed to reset settings.')],
            },
        })
    }
}
