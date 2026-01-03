/**
 * Base command handler types and interfaces
 */

import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from 'discord.js'
import type { CommandCategory } from '../../../config/constants'

export type CommandContext = {
    interaction: ChatInputCommandInteraction
    guildId: string
    userId: string
    channelId: string
}

export type CommandValidator = (context: CommandContext) => Promise<boolean>

export type CommandExecutor = (context: CommandContext) => Promise<void>

export type CommandHandler = {
    name: string
    category: CommandCategory
    data: SlashCommandBuilder
    validators: readonly CommandValidator[]
    executor: CommandExecutor
}

export type CommandHandlerOptions = {
    name: string
    category: CommandCategory
    data: SlashCommandBuilder
    validators?: CommandValidator[]
    executor: CommandExecutor
}
