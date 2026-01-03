import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    SlashCommandOptionsOnlyBuilder,
} from '@discordjs/builders'
import type { CustomClient } from './index'
import type { ChatInputCommandInteraction } from 'discord.js'

export type TCommandData =
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder

export type CommandExecuteParams = {
    readonly client: CustomClient
    readonly interaction: ChatInputCommandInteraction
}

export type TCommandExecute = (_options: CommandExecuteParams) => Promise<void>
