import type { ChatInputCommandInteraction } from 'discord.js'
import { errorLog } from '@lucky/shared/utils'
import { collaborativePlaylistService } from '../../../../../services/musicRecommendation/collaborativePlaylist'
import { markCommandOutcome } from '../../../../../utils/monitoring/commandOutcome'
import { createErrorEmbed } from '../../../../../utils/general/embeds'
import { interactionReply } from '../../../../../utils/general/interactionReply'

/**
 * Collaborative mode counts one request per command, whatever it queues.
 * Every command that adds music (/play, /playtop, /playskip, /album,
 * /artist) checks before searching and records once something was queued
 * (#3269).
 */

/** Replies and returns true when the collaborative request limit is hit. */
export async function rejectOverCollaborativeLimit(
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<boolean> {
    const collaborativeCheck = collaborativePlaylistService.canAddTracks(
        guildId,
        interaction.user.id,
        1,
    )
    if (collaborativeCheck.allowed) return false
    markCommandOutcome(interaction, { outcome: 'user_error' })
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createErrorEmbed(
                    'Contribution limit reached',
                    `Collaborative mode limit reached (${collaborativeCheck.limit} track requests per user).`,
                ),
            ],
        },
    })
    return true
}

export function recordCollaborativeContribution(
    interaction: ChatInputCommandInteraction,
    guildId: string,
): void {
    try {
        collaborativePlaylistService.recordContribution(
            guildId,
            interaction.user.id,
            1,
        )
    } catch (err) {
        errorLog({
            message: 'Failed to record contribution',
            error: err,
        })
    }
}
