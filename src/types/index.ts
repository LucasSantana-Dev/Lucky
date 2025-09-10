import type {
    Client,
    Collection,
    ChatInputCommandInteraction,
} from "discord.js"
import type { Player } from "discord-player"
import type Command from "../models/Command"

export interface ICustomClient extends Client {
    commands: Collection<string, Command>
    player: Player
}

export interface ICommandType {
    data: unknown

    execute: (_interaction: ChatInputCommandInteraction) => Promise<void>
}
