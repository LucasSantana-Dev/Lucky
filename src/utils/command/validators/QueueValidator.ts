/**
 * Queue validation following Single Responsibility Principle
 */

import type { GuildQueue } from "discord-player"
import type {
    CommandContext,
    CommandResult,
} from "../../../types/command/BaseCommand"
import { BaseValidator } from "./BaseValidator"
import { ErrorCode } from "../../../types/errors"
import { errorEmbed } from "../../general/embeds"
import { messages } from "../../general/messages"
import { interactionReply } from "../../general/interactionReply"

export class QueueValidator extends BaseValidator {
    constructor() {
        super("QueueValidator")
    }

    async validate(context: CommandContext): Promise<CommandResult> {
        // This validator expects the queue to be passed in the context data
        const queue = context.data as GuildQueue | null

        if (!queue) {
            await interactionReply({
                interaction: context.interaction,
                content: {
                    embeds: [errorEmbed("Erro", messages.error.noQueue)],
                },
            })

            return this.createErrorResult(
                "No music queue found",
                ErrorCode.MUSIC_QUEUE_EMPTY,
            )
        }

        return this.createSuccessResult({ queue })
    }
}

export class CurrentTrackValidator extends BaseValidator {
    constructor() {
        super("CurrentTrackValidator")
    }

    async validate(context: CommandContext): Promise<CommandResult> {
        const queue = context.data as GuildQueue | null

        if (!queue?.currentTrack) {
            await interactionReply({
                interaction: context.interaction,
                content: {
                    embeds: [errorEmbed("Erro", messages.error.noTrack)],
                },
            })

            return this.createErrorResult(
                "No track is currently playing",
                ErrorCode.MUSIC_TRACK_NOT_FOUND,
            )
        }

        return this.createSuccessResult({
            queue,
            currentTrack: queue.currentTrack,
        })
    }
}

export class IsPlayingValidator extends BaseValidator {
    constructor() {
        super("IsPlayingValidator")
    }

    async validate(context: CommandContext): Promise<CommandResult> {
        const queue = context.data as GuildQueue | null

        if (!queue?.isPlaying()) {
            await interactionReply({
                interaction: context.interaction,
                content: {
                    embeds: [errorEmbed("Erro", messages.error.notPlaying)],
                },
            })

            return this.createErrorResult(
                "No music is currently playing",
                ErrorCode.MUSIC_PLAYBACK_FAILED,
            )
        }

        return this.createSuccessResult({
            queue,
            isPlaying: true,
        })
    }
}
