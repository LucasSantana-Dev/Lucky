import type { ChatInputCommandInteraction } from 'discord.js'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { createErrorEmbed, createSuccessEmbed } from '../../../../../utils/general/embeds'
import { errorLog } from '@lucky/shared/utils'

const recommendationConfigService = {
    resetSettings: async (_guildId: string): Promise<void> => {},
}

export async function handleResetSettings(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    try {
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

        const confirm = interaction.options.getBoolean('confirm', true)
        if (!confirm) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'Reset cancelled. You must confirm the reset.',
                        ),
                    ],
                },
            })
            return
        }

        await recommendationConfigService.resetSettings(guildId)

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        'Settings Reset',
                        'All recommendation settings have been reset to their default values.',
                    ),
                ],
            },
        })
    } catch (error) {
        errorLog({ message: 'Failed to reset recommendation settings', error })
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Error', 'Failed to reset settings.')],
            },
        })
    }
}
