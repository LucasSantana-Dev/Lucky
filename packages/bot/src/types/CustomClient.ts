import type {
    ChatInputCommandInteraction,
    Client,
    Collection,
} from 'discord.js'
import type { Player } from 'discord-player'
import type Command from '../models/Command'
import type ContextMenuCommand from '../models/ContextMenuCommand'

export type CustomClient = Client & {
    commands: Collection<string, Command>
    contextMenus: Collection<string, ContextMenuCommand>
    player: Player
    cooldowns: Collection<string, number>
    redis?: unknown
    metrics?: unknown
    tracer?: unknown
    token?: string
    clientId?: string
}

export type CommandType = {
    data: unknown
    execute: (_interaction: ChatInputCommandInteraction) => Promise<void>
}
