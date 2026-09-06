import type { Message } from 'discord.js'
import { warnLog } from '@lucky/shared/utils'

/** discord.js DiscordAPIError code for "Unknown Message" — already deleted or aged out. */
const UNKNOWN_MESSAGE_CODE = 10008

/**
 * Deletes a message, swallowing the expected "already gone" race (someone
 * else deleted it, or it aged out) but logging anything else — most notably
 * a missing-permissions failure, which would otherwise leave automod
 * silently doing nothing while reporting success.
 */
export async function deleteMessageSafely(message: Message): Promise<void> {
    await message.delete().catch((error: { code?: number }) => {
        if (error?.code === UNKNOWN_MESSAGE_CODE) return
        warnLog({
            message: 'Failed to delete message',
            error,
            data: { channelId: message.channelId },
        })
    })
}
