import type {
    Client,
    Collection,
    ChatInputCommandInteraction,
} from "discord.js"
import type { Player } from "discord-player"
import type Command from "../models/Command"

export type CustomClient = Client & {
    commands: Collection<string, Command>
    player: Player
}

export type CommandType = {
    data: unknown
    execute: (_interaction: ChatInputCommandInteraction) => Promise<void>
}
