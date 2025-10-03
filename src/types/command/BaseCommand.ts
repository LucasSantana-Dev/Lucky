/**
 * Base command interfaces following SOLID principles
 */

import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from "discord.js"
import type { CommandCategory } from "../../config/constants"
import type { BotError } from "../errors"

export type CommandContext = {
    readonly interaction: ChatInputCommandInteraction
    readonly guildId: string | null
    readonly userId: string
    readonly channelId: string | null
    readonly correlationId: string
    readonly data?: unknown
}

export type CommandResult = {
    readonly success: boolean
    readonly error?: BotError
    readonly data?: unknown
}

export type CommandValidator = {
    readonly name: string
    validate(context: CommandContext): Promise<CommandResult>
}

export type CommandExecutor = {
    readonly name: string
    execute(context: CommandContext): Promise<CommandResult>
}

export type CommandHandler = {
    readonly name: string
    readonly category: CommandCategory
    readonly data: SlashCommandBuilder
    readonly validators: readonly CommandValidator[]
    readonly executor: CommandExecutor

    handle(interaction: ChatInputCommandInteraction): Promise<void>
}

export type CommandFactory = {
    createCommand(name: string): CommandHandler
}
