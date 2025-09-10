/**
 * Base command interfaces following SOLID principles
 */

import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from "discord.js"
import type { CommandCategory } from "../../config/constants"
import type { BotError } from "../errors"

export interface CommandContext {
    readonly interaction: ChatInputCommandInteraction
    readonly guildId: string | null
    readonly userId: string
    readonly channelId: string | null
    readonly correlationId: string
    readonly data?: unknown
}

export interface CommandResult {
    readonly success: boolean
    readonly error?: BotError
    readonly data?: unknown
}

export interface CommandValidator {
    readonly name: string
    validate(context: CommandContext): Promise<CommandResult>
}

export interface CommandExecutor {
    readonly name: string
    execute(context: CommandContext): Promise<CommandResult>
}

export interface CommandHandler {
    readonly name: string
    readonly category: CommandCategory
    readonly data: SlashCommandBuilder
    readonly validators: readonly CommandValidator[]
    readonly executor: CommandExecutor

    handle(interaction: ChatInputCommandInteraction): Promise<void>
}

export interface CommandFactory {
    createCommand(name: string): CommandHandler
}
