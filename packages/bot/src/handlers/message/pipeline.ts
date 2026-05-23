import type { Message } from 'discord.js'
import type { MessageContext, MessageHandler } from './types'
import { errorLog } from '@lucky/shared/utils'

export class MessagePipeline {
    private handlers: MessageHandler[] = []

    register(handler: MessageHandler): this {
        this.handlers.push(handler)
        return this
    }

    async execute(message: Message, context: MessageContext): Promise<void> {
        for (const handler of this.handlers) {
            try {
                const canHandle = await handler.canHandle(message, context)
                if (!canHandle) continue

                const result = await handler.handle(message, context)
                if (result.stop) break
            } catch (error) {
                errorLog({
                    message: `Error in ${handler.name} handler:`,
                    error,
                })
            }
        }
    }
}
