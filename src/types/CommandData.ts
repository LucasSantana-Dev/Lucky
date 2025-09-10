import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    SlashCommandOptionsOnlyBuilder,
} from "@discordjs/builders"
import type { ICustomClient } from "./index"
import type { ChatInputCommandInteraction } from "discord.js"

export type TCommandData =
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder

export interface ICommandExecuteParams {
    client: ICustomClient
    interaction: ChatInputCommandInteraction
}

export type TCommandExecute = (_options: ICommandExecuteParams) => Promise<void>
