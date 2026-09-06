import type { Message } from 'discord.js'
import { warnLog } from '@lucky/shared/utils'

const UNKNOWN_MESSAGE = 10008

/**
 * Deletes a message, ignoring "already gone" (10008 Unknown Message) but
 * logging anything else — most notably 50013 Missing Permissions, which
 * otherwise silently disables auto-mod's only enforcement action.
 */
export async function safeDeleteMessage(message: Message): Promise<void> {
    await message.delete().catch((error: unknown) => {
        if ((error as { code?: number })?.code === UNKNOWN_MESSAGE) return
        warnLog({
            message: 'Failed to delete message',
            error,
            data: { channelId: message.channelId },
        })
    })
}
