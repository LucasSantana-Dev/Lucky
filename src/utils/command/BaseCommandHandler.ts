/**
 * Base command handler following SOLID principles
 */

import type {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} from "discord.js"
import type { CommandCategory } from "../../config/constants"
import type {
    CommandContext,
    CommandValidator,
    CommandExecutor,
    CommandHandler,
} from "../../types/command/BaseCommand"
import { handleError, createUserErrorMessage } from "../error/errorHandler"
import { errorEmbed } from "../general/embeds"

export abstract class BaseCommandHandler implements CommandHandler {
    public readonly name: string
    public readonly category: CommandCategory
    public readonly data: SlashCommandBuilder
    public readonly validators: readonly CommandValidator[]
    public readonly executor: CommandExecutor

    constructor(
        name: string,
        category: CommandCategory,
        data: SlashCommandBuilder,
        validators: readonly CommandValidator[],
        executor: CommandExecutor,
    ) {
        this.name = name
        this.category = category
        this.data = data
        this.validators = validators
        this.executor = executor
    }

    async handle(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            // Defer the interaction to prevent timeout
            await interaction.deferReply()

            // Create command context
            const context: CommandContext = {
                interaction,
                guildId: interaction.guildId,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                correlationId: this.generateCorrelationId(),
            }

            // Run all validators
            for (const validator of this.validators) {
                const validationResult = await validator.validate(context)

                if (!validationResult.success) {
                    await this.handleValidationError(
                        interaction,
                        validationResult.error,
                    )
                    return
                }

                // Merge validation data into context
                if (validationResult.data) {
                    Object.assign(context, validationResult.data)
                }
            }

            // Execute the command
            const executionResult = await this.executor.execute(context)

            if (!executionResult.success) {
                await this.handleExecutionError(
                    interaction,
                    executionResult.error,
                )
                return
            }

            // Handle successful execution
            await this.handleSuccess(interaction, executionResult.data)
        } catch (error) {
            const structuredError = handleError(
                error,
                `command execution: ${this.name}`,
                {
                    guildId: interaction.guildId ?? undefined,
                    userId: interaction.user.id,
                    channelId: interaction.channelId,
                },
            )

            await this.handleUnexpectedError(interaction, structuredError)
        }
    }

    protected async handleValidationError(
        interaction: ChatInputCommandInteraction,
        error: unknown,
    ): Promise<void> {
        // Validation errors are already handled by validators with user-friendly messages
        // This is a fallback for unexpected validation errors
        try {
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Erro de validação",
                        createUserErrorMessage(error),
                    ),
                ],
            })
        } catch (replyError) {
            // Use structured error handling instead of console.error
            handleError(replyError, "validation error reply", {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            })
        }
    }

    protected async handleExecutionError(
        interaction: ChatInputCommandInteraction,
        error: unknown,
    ): Promise<void> {
        try {
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Erro de execução",
                        createUserErrorMessage(error),
                    ),
                ],
            })
        } catch (replyError) {
            handleError(replyError, "execution error reply", {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            })
        }
    }

    protected async handleUnexpectedError(
        interaction: ChatInputCommandInteraction,
        error: unknown,
    ): Promise<void> {
        try {
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Erro inesperado",
                        createUserErrorMessage(error),
                    ),
                ],
            })
        } catch (replyError) {
            handleError(replyError, "unexpected error reply", {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            })
        }
    }

    protected async handleSuccess(
        interaction: ChatInputCommandInteraction,
        _data?: unknown,
    ): Promise<void> {
        // Default success handling - can be overridden by subclasses
        try {
            await interaction.editReply({
                content: "✅ Comando executado com sucesso!",
            })
        } catch (replyError) {
            handleError(replyError, "success reply", {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            })
        }
    }

    private generateCorrelationId(): string {
        return `cmd_${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
}
