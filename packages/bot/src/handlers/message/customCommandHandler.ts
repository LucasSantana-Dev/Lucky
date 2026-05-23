import type { Message } from 'discord.js'
import { customCommandService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

export const customCommandHandler: MessageHandler = {
    name: 'CustomCommand',

    async canHandle(
        message: Message,
        context: MessageContext,
    ): Promise<boolean> {
        return (
            context.featureToggles['CUSTOM_COMMANDS'] === true &&
            !message.author.bot
        )
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const commands = await customCommandService.listCommands(
                context.guild.id,
            )
            if (!commands || commands.length === 0) {
                return { stop: false }
            }

            const matchedCommand = commands.find((cmd: any) => {
                return (
                    message.content === cmd.trigger ||
                    message.content.startsWith(cmd.trigger + ' ')
                )
            })

            if (!matchedCommand) {
                return { stop: false }
            }

            await message.reply({
                content: matchedCommand.response ?? '',
                allowedMentions: { repliedUser: false },
            })

            await customCommandService.incrementUsage(
                context.guild.id,
                matchedCommand.name,
            )

            return { stop: false }
        } catch (error) {
            errorLog({
                message: 'Error handling custom command:',
                error,
            })
            return { stop: false }
        }
    },
}
