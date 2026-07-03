import type { Message } from 'discord.js'
import { afkService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import type { MessageContext, MessageHandler, MessageHandlerResult } from './types'

export const afkHandler: MessageHandler = {
    name: 'Afk',

    async canHandle(message: Message): Promise<boolean> {
        // Skip if message is from a bot
        return !message.author.bot
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            // If the author has AFK status in this guild, clear it and reply
            const afkStatus = await afkService.get(
                context.guild.id,
                message.author.id,
            )
            if (afkStatus) {
                try {
                    await afkService.clear(context.guild.id, message.author.id)
                    await message.reply({
                        content: `👋 Welcome back, ${message.author}!`,
                        allowedMentions: { repliedUser: false },
                    })
                } catch (replyError) {
                    errorLog({
                        message: 'Failed to send welcome back message:',
                        error: replyError,
                    })
                }
            }

            // If the message mentions users, notify about their AFK status
            if (message.mentions.users.size > 0) {
                const mentionedIds = Array.from(message.mentions.users.keys())
                const afkStatuses = await afkService.getMany(
                    context.guild.id,
                    mentionedIds,
                )

                if (afkStatuses.length > 0) {
                    // Limit to max 3 replies per message to avoid spam
                    for (const afk of afkStatuses.slice(0, 3)) {
                        const user = message.mentions.users.get(afk.userId)
                        if (user) {
                            try {
                                const reasonText = afk.reason
                                    ? `: ${afk.reason}`
                                    : ''
                                await message.reply({
                                    content: `ℹ️ ${user} is AFK${reasonText}`,
                                    allowedMentions: { repliedUser: false },
                                })
                            } catch (replyError) {
                                errorLog({
                                    message: 'Failed to send AFK mention reply:',
                                    error: replyError,
                                })
                            }
                        }
                    }
                }
            }

            return { stop: false }
        } catch (error) {
            errorLog({
                message: 'Error handling AFK message:',
                error,
            })
            return { stop: false }
        }
    },
}
