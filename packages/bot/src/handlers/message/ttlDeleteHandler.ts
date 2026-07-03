import type { Message } from 'discord.js'
import { channelCleanupService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

export const ttlDeleteHandler: MessageHandler = {
    name: 'TTL Delete',

    async canHandle(
        message: Message,
        _context: MessageContext,
    ): Promise<boolean> {
        // Skip bot messages
        if (message.author.bot) {
            return false
        }
        return true
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const guildId = context.guild.id
            const channelId = message.channelId

            const config = await channelCleanupService.getConfig(
                guildId,
                channelId,
            )

            // No config or not enabled or not TTL mode
            if (!config || !config.enabled || config.mode !== 'ttl') {
                return { stop: false }
            }

            const ttlSeconds = config.ttlSeconds
            if (!ttlSeconds || ttlSeconds < 5 || ttlSeconds > 86400) {
                return { stop: false }
            }

            // Schedule deletion. Re-check the config at fire time so turning
            // cleanup off (or switching mode) cancels pending deletes
            // (review P2).
            setTimeout(() => {
                void (async () => {
                    const current = await channelCleanupService
                        .getConfig(guildId, channelId)
                        .catch(() => null)
                    if (
                        !current ||
                        !current.enabled ||
                        current.mode !== 'ttl'
                    ) {
                        return
                    }
                    await message.delete().catch(() => {
                        // Message may already be gone — ignore.
                    })
                })()
            }, ttlSeconds * 1000)

            return { stop: false }
        } catch (error) {
            errorLog({
                message: 'Error handling TTL delete:',
                error,
            })
            return { stop: false }
        }
    },
}
