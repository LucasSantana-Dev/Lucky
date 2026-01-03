import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from 'discord.js'
import type { CommandCategory } from '../../../config/constants'
import { BaseCommandHandlerService } from './service'
import type {
    CommandContext,
    CommandValidator,
    CommandExecutor,
    CommandHandler,
    CommandHandlerOptions,
} from './types'

/**
 * Base command handler following SOLID principles
 */
export abstract class BaseCommandHandler implements CommandHandler {
    public readonly name: string
    public readonly category: CommandCategory
    public readonly data: SlashCommandBuilder
    public readonly validators: readonly CommandValidator[]
    public readonly executor: CommandExecutor
    private readonly service: BaseCommandHandlerService

    constructor(options: CommandHandlerOptions) {
        this.name = options.name
        this.category = options.category
        this.data = options.data
        this.validators = options.validators ?? []
        this.executor = options.executor
        this.service = new BaseCommandHandlerService()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        return this.service.execute(interaction, this.validators, this.executor)
    }

    async validateContext(context: CommandContext): Promise<boolean> {
        return this.service.validateContext(context)
    }

    async handleValidationError(
        interaction: ChatInputCommandInteraction,
        error: string,
    ): Promise<void> {
        return this.service.handleValidationError(interaction, error)
    }

    async handleExecutionError(
        interaction: ChatInputCommandInteraction,
        error: Error,
    ): Promise<void> {
        return this.service.handleExecutionError(interaction, error)
    }
}

export type {
    CommandContext,
    CommandValidator,
    CommandExecutor,
    CommandHandler,
    CommandHandlerOptions,
}
