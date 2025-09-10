/**
 * Guild validation following Single Responsibility Principle
 */

import type {
    CommandContext,
    CommandResult,
} from "../../../types/command/BaseCommand"
import { BaseValidator } from "./BaseValidator"
import { ErrorCode } from "../../../types/errors"
import { errorEmbed } from "../../general/embeds"
import { messages } from "../../general/messages"
import { interactionReply } from "../../general/interactionReply"

export class GuildValidator extends BaseValidator {
    constructor() {
        super("GuildValidator")
    }

    async validate(context: CommandContext): Promise<CommandResult> {
        if (!context.guildId) {
            await interactionReply({
                interaction: context.interaction,
                content: {
                    embeds: [errorEmbed("Erro", messages.error.guildOnly)],
                },
            })

            return this.createErrorResult(
                "Command can only be used in a guild/server",
                ErrorCode.DISCORD_GUILD_NOT_FOUND,
            )
        }

        return this.createSuccessResult({ guildId: context.guildId })
    }
}
