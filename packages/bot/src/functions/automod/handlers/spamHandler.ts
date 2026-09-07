import type { Message } from 'discord.js'
import { autoModService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { safeDeleteMessage } from './messageDelete'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from '../../../handlers/message/types'

export const spamHandler: MessageHandler = {
    name: 'Spam',

    async canHandle(
        message: Message,
        context: MessageContext,
    ): Promise<boolean> {
        if (context.featureToggles['AUTOMOD'] !== true || message.author.bot) {
            return false
        }

        const settings = await autoModService.getSettings(context.guild.id)
        return settings?.spamEnabled === true
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const guildId = context.guild.id
            const userId = message.author.id

            const isSpam = await autoModService.trackMessageAndCheckSpam(
                guildId,
                userId,
            )
            if (!isSpam) {
                return { stop: false }
            }

            await safeDeleteMessage(message)
            return { stop: true }
        } catch (error) {
            errorLog({
                message: 'Error checking spam:',
                error,
            })
            return { stop: false }
        }
    },
}
