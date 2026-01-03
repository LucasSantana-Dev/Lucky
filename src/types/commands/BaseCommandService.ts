/**
 * Base command service with common execution patterns
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import { handleError, createUserErrorMessage } from '../../utils/error/errorHandler'
import { errorEmbed } from '../../utils/general/embeds'
import type { CommandContext, CommandValidator, CommandExecutor } from '../../utils/command/BaseCommandHandler/types'

export interface BaseCommandServiceOptions {
    commandName: string
    validators?: readonly CommandValidator[]
    executor: CommandExecutor
}

export abstract class BaseCommandService {
    protected readonly commandName: string
    protected readonly validators: readonly CommandValidator[]
    protected readonly executor: CommandExecutor

    constructor(options: BaseCommandServiceOptions) {
        this.commandName = options.commandName
        this.validators = options.validators ?? []
        this.executor = options.executor
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const context = this.createContext(interaction)

            // Run validators
            for (const validator of this.validators) {
                const isValid = await validator(context)
                if (!isValid) {
                    await this.handleValidationFailure(interaction)
                    return
                }
            }

            // Execute command
            await this.executor(context)
        } catch (error) {
            await this.handleExecutionError(interaction, error)
        }
    }

    protected createContext(interaction: ChatInputCommandInteraction): CommandContext {
        return {
            interaction,
            guildId: interaction.guildId ?? '',
            userId: interaction.user.id,
            channelId: interaction.channelId,
        }
    }

    protected async handleValidationFailure(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply({
            embeds: [
                errorEmbed(
                    'Validation failed',
                    'Command validation failed',
                ),
            ],
            ephemeral: true,
        })
    }

    protected async handleExecutionError(
        interaction: ChatInputCommandInteraction,
        error: unknown,
    ): Promise<void> {
        await handleError(error, {
            userId: interaction.user.id,
            guildId: interaction.guildId ?? '',
            details: { command: this.commandName },
        })

        const userMessage = createUserErrorMessage(error)
        await interaction.reply({
            embeds: [errorEmbed('Command Error', userMessage)],
            ephemeral: true,
        })
    }
}
