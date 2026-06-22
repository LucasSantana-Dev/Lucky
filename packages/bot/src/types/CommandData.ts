import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    SlashCommandOptionsOnlyBuilder,
    ContextMenuCommandBuilder,
} from '@discordjs/builders'
import type { CustomClient } from './CustomClient'
import type {
    ChatInputCommandInteraction,
    MessageContextMenuCommandInteraction,
} from 'discord.js'

export type TCommandData =
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder

export type CommandExecuteParams = {
    readonly client: CustomClient
    readonly interaction: ChatInputCommandInteraction
}

export type TCommandExecute = (_options: CommandExecuteParams) => Promise<void>

export type TContextMenuData = ContextMenuCommandBuilder

export type ContextMenuExecuteParams = {
    readonly client: CustomClient
    readonly interaction: MessageContextMenuCommandInteraction
}

export type TContextMenuExecute = (
    _options: ContextMenuExecuteParams,
) => Promise<void>
