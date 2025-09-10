/**
 * Base validator class following SOLID principles
 */

import type { ChatInputCommandInteraction } from "discord.js"
import type {
    CommandContext,
    CommandResult,
    CommandValidator,
} from "../../../types/command/BaseCommand"
import { ValidationError, ErrorCode } from "../../../types/errors"
import { createCorrelationId } from "../../error/errorHandler"

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
        _code: ErrorCode = ErrorCode.VALIDATION_INVALID_INPUT,
    ): CommandResult {
        return {
            success: false,
            error: new ValidationError(message, {
                correlationId: createCorrelationId(),
                details: { validator: this.name },
            }),
        }
    }

    protected createSuccessResult(data?: unknown): CommandResult {
        return {
            success: true,
            data,
        }
    }
}
