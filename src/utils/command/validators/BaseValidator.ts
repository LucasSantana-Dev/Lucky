/**
 * Base validator class following SOLID principles
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import type {
    CommandContext,
    CommandResult,
    CommandValidator,
} from '../../../types/command/BaseCommand'
import { VALIDATION_ERROR_CODES } from '../../../types/errors/validation'

type ErrorCode =
    (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES]
import { createCorrelationId } from '../../error/errorHandler'

class ValidationError extends Error {
    constructor(
        message: string,
        public code?: string,
    ) {
        super(message)
        this.name = 'ValidationError'
    }
}

export abstract class BaseValidator implements CommandValidator {
    public readonly name: string

    constructor(name: string) {
        this.name = name
    }

    abstract validate(context: CommandContext): Promise<CommandResult>

    protected createContext(
        interaction: ChatInputCommandInteraction,
    ): CommandContext {
        return {
            interaction,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            correlationId: createCorrelationId(),
        }
    }

    protected createErrorResult(
        message: string,
        _code: ErrorCode = VALIDATION_ERROR_CODES.VALIDATION_INVALID_INPUT,
    ): CommandResult {
        return {
            success: false,
            error: new ValidationError(message, _code),
        }
    }

    protected createSuccessResult(data?: unknown): CommandResult {
        return {
            success: true,
            data,
        }
    }
}
