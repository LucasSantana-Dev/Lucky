import type { ChatInputCommandInteraction } from 'discord.js'
import { errorLog } from '@lucky/shared/utils'
import { collaborativePlaylistService } from '../../../../../services/musicRecommendation/collaborativePlaylist'
import { markCommandOutcome } from '../../../../../utils/monitoring/commandOutcome'
import { createErrorEmbed } from '../../../../../utils/general/embeds'
import { interactionReply } from '../../../../../utils/general/interactionReply'

/**
 * One collaborative request held for a command. Every command that adds
 * music (/play, /playtop, /playskip, /album, /artist) takes one before it
 * searches, commits it once something was queued, and settles it when it is
 * done: an uncommitted request is given back (#3269).
 */
export type CollaborativeReservation = {
    commit: () => void
    settle: () => void
}

function recordSafely(run: () => void): void {
    try {
        run()
    } catch (err) {
        errorLog({ message: 'Failed to record contribution', error: err })
    }
}

/**
 * Counts the request right after the check, with no await in between, so
 * two commands racing from the same user cannot both pass a limit of one.
 * Replies and returns null when the limit is already reached.
 */
export async function reserveCollaborativeRequest(
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<CollaborativeReservation | null> {
    const userId = interaction.user.id
    const check = collaborativePlaylistService.canAddTracks(guildId, userId, 1)
    if (!check.allowed) {
        markCommandOutcome(interaction, { outcome: 'user_error' })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Contribution limit reached',
                        `Collaborative mode limit reached (${check.limit} track requests per user).`,
                    ),
                ],
            },
        })
        return null
    }

    recordSafely(() =>
        collaborativePlaylistService.recordContribution(guildId, userId, 1),
    )
    let committed = false
    let settled = false
    return {
        commit: () => {
            committed = true
        },
        settle: () => {
            if (settled) return
            settled = true
            if (committed) return
            recordSafely(() =>
                collaborativePlaylistService.releaseContribution(
                    guildId,
                    userId,
                    1,
                ),
            )
        },
    }
}
