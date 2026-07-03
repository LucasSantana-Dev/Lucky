import type { Message } from 'discord.js'
import { starboardService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

/**
 * Engagement seeding: pre-adds the guild's starboard emoji to messages so
 * members discover the feature with one click. Entirely config-driven
 * (StarboardConfig.seedReaction / seedChannelIds) — the bot's own reaction is
 * excluded from the star count by the reaction handler.
 */
export const starboardSeedHandler: MessageHandler = {
    name: 'StarboardSeed',

    async canHandle(message: Message): Promise<boolean> {
        return !message.author.bot
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const config = await starboardService.getConfig(context.guild.id)
            if (!config?.seedReaction) {
                return { stop: false }
            }
            // Never seed the starboard channel itself — the highlight posts
            // there would recursively collect seeds.
            if (message.channelId === config.channelId) {
                return { stop: false }
            }
            if (
                config.seedChannelIds.length > 0 &&
                !config.seedChannelIds.includes(message.channelId)
            ) {
                return { stop: false }
            }
            // Let failures (bad emoji, missing perms) reach the outer catch
            // so misconfiguration is visible in logs (cubic P2).
            await message.react(config.emoji)
        } catch (error) {
            errorLog({ message: 'Error seeding starboard reaction:', error })
        }
        return { stop: false }
    },
}
