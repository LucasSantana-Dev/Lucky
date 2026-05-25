import type { Guild, GuildMember, Message } from 'discord.js'

export interface MessageHandler {
    name: string
    canHandle(message: Message, context: MessageContext): Promise<boolean>
    handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult>
}

export interface MessageHandlerResult {
    stop: boolean
}

export interface MessageContext {
    guild: Guild
    member: GuildMember
    featureToggles: Record<string, boolean>
}
