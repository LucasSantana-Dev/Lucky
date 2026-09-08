import type { Message } from 'discord.js'
import { warnLog } from '@lucky/shared/utils'
import { createGuildWarnThrottle } from '../../../utils/misc/guildWarnThrottle'

const UNKNOWN_MESSAGE = 10008
const deleteFailWarnThrottle = createGuildWarnThrottle(60_000)

/**
 * Deletes a message, ignoring "already gone" (10008 Unknown Message) but
 * logging anything else — most notably 50013 Missing Permissions, which
 * otherwise silently disables auto-mod's only enforcement action.
 *
 * Logging is throttled per guild to prevent flooding the backend on persistent
 * permission outages. Logging failures are caught to ensure they don't change
 * the delete outcome for callers.
 */
export async function safeDeleteMessage(message: Message): Promise<void> {
    await message.delete().catch((error: unknown) => {
        if ((error as { code?: number })?.code === UNKNOWN_MESSAGE) return
        if (!deleteFailWarnThrottle.shouldWarn(message.guild?.id)) return
        try {
            warnLog({
                message: 'Failed to delete message',
                error,
                data: { channelId: message.channelId },
            })
        } catch (logError) {
            console.error(
                'Failed to delete message and log warning',
                error,
                { channelId: message.channelId },
                logError,
            )
        }
    })
}
