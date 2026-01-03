import type { ChatInputCommandInteraction } from 'discord.js'
import { handleError, createUserErrorMessage } from '../../error/errorHandler'
import { errorEmbed } from '../../general/embeds'
import type { CommandContext, CommandValidator, CommandExecutor } from './types'

/**
 * Base command handler service
 */
export class BaseCommandHandlerService {
    async execute(
        interaction: ChatInputCommandInteraction,
        validators: readonly CommandValidator[],
        executor: CommandExecutor,
    ): Promise<void> {
        try {
            const context: CommandContext = {
                interaction,
                guildId: interaction.guildId ?? '',
                userId: interaction.user.id,
                channelId: interaction.channelId,
            }

            // Run validators
            for (const validator of validators) {
                const isValid = await validator(context)
                if (!isValid) {
                    await interaction.reply({
                        embeds: [
                            errorEmbed(
                                'Validation failed',
                                'Command validation failed',
                            ),
                        ],
                        ephemeral: true,
                    })
                    return
                }
            }

            // Execute command
            await executor(context)
        } catch (error) {
            await handleError(error, {
                userId: interaction.user.id,
                guildId: interaction.guildId ?? '',
                details: { command: interaction.commandName },
            })

            const userMessage = createUserErrorMessage(error)
            await interaction.reply({
                embeds: [errorEmbed('Command Error', userMessage)],
                ephemeral: true,
            })
        }
    }

    async validateContext(context: CommandContext): Promise<boolean> {
        // Basic context validation
        if (!context.guildId || !context.userId || !context.channelId) {
            return false
        }

        return true
    }

    async handleValidationError(
        interaction: ChatInputCommandInteraction,
        error: string,
    ): Promise<void> {
        await interaction.reply({
            embeds: [errorEmbed('Validation Error', error)],
            ephemeral: true,
        })
    }

    async handleExecutionError(
        interaction: ChatInputCommandInteraction,
        error: Error,
    ): Promise<void> {
        await handleError(error, {
            userId: interaction.user.id,
            guildId: interaction.guildId ?? '',
            details: { command: interaction.commandName },
        })

        const userMessage = createUserErrorMessage(error)
        await interaction.reply({
            embeds: [errorEmbed('Command Error', userMessage)],
            ephemeral: true,
        })
    }
}
