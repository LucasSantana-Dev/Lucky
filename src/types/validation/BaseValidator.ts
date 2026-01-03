/**
 * Base validator with common validation patterns
 */

import type { CommandContext } from '../../utils/command/BaseCommandHandler/types'
// import { createCorrelationId } from '../../utils/error/errorHandler'
import { VALIDATION_ERROR_CODES } from '../errors/validation'
import type { ChatInputCommandInteraction } from 'discord.js'

export interface ValidationResult {
    success: boolean
    error?: Error
    data?: unknown
}

export abstract class BaseValidator {
    protected readonly name: string

    constructor(name: string) {
        this.name = name
    }

    abstract validate(context: CommandContext): Promise<ValidationResult>

    protected createContext(interaction: ChatInputCommandInteraction): CommandContext {
        return {
            interaction,
            guildId: interaction.guildId ?? '',
            userId: interaction.user.id,
            channelId: interaction.channelId ?? '',
        }
    }

    protected createErrorResult(
        message: string,
        _code: string = VALIDATION_ERROR_CODES.VALIDATION_INVALID_INPUT,
    ): ValidationResult {
        return {
            success: false,
            error: new Error(message),
        }
    }

    protected createSuccessResult(data?: unknown): ValidationResult {
        return {
            success: true,
            data,
        }
    }
}
