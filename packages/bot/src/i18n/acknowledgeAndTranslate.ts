import type { ChatInputCommandInteraction } from 'discord.js'
import type { TFunction } from 'i18next'
import { debugLog } from '@lucky/shared/utils'
import { translatorForInteraction } from './translatorForInteraction'

/**
 * Acknowledge the interaction before the translator lookup, which can hit the
 * guild-settings database on a cold language cache and exceed Discord's 3s
 * window. A failed defer is not fatal: interactionReply swallows later reply
 * failures, so the command still runs.
 */
export async function acknowledgeAndTranslate(
    interaction: ChatInputCommandInteraction,
): Promise<TFunction> {
    if (!interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferReply()
        } catch (error) {
            debugLog({
                message: `Defer failed in guild ${interaction.guildId}, continuing`,
                error,
            })
        }
    }
    return translatorForInteraction(interaction)
}
