import {
    Events,
    type Client,
    type MessageReaction,
    type User,
    type PartialMessageReaction,
    type PartialUser,
} from 'discord.js'
import { giveawayService } from '@lucky/shared/services'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { getSongInfoMessage } from './player/nowPlayingDisplay'
import { recordRecommendationSkipReason } from '../services/musicRecommendation/recommendationTelemetry'
import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'
import { SKIP_REASON_EMOJI_MAP } from '../utils/music/skipReasonMap'

async function handleGiveawayReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
): Promise<void> {
    if (user.bot) return
    if (user.partial) await user.fetch()

    if (reaction.emoji.name !== '🎉') return

    const giveaway = await giveawayService.getActiveByMessageId(
        reaction.message.id,
    )
    if (!giveaway) return

    // Only allow entries for active (not ended) giveaways
    if (giveaway.endedAt) return

    await giveawayService.addEntry(giveaway.id, user.id)
}

async function handleSkipReasonReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
): Promise<void> {
    if (user.bot) {
        debugLog({
            message: 'Skipping skip-reason reaction: reaction added by bot',
            data: { userId: user.id },
        })
        return
    }

    if (reaction.partial) await reaction.fetch()

    if (!reaction.message.guild) {
        debugLog({
            message: 'Skipping skip-reason reaction: guild context missing',
        })
        return
    }

    const guildId = reaction.message.guild.id
    const messageId = reaction.message.id
    const emojiName = reaction.emoji.name ?? ''

    // Check if this emoji is a skip-reason emoji
    const skipReason = SKIP_REASON_EMOJI_MAP[emojiName]
    if (!skipReason) {
        debugLog({
            message:
                'Skipping skip-reason reaction: emoji not a skip-reason emoji',
            data: { guildId, emojiName, messageId },
        })
        return
    }

    // Check if this message is the now-playing message for the guild
    const nowPlayingMsg = getSongInfoMessage(guildId)
    if (!nowPlayingMsg || nowPlayingMsg.messageId !== messageId) {
        debugLog({
            message:
                'Skipping skip-reason reaction: message is not the now-playing message',
            data: {
                guildId,
                messageId,
                nowPlayingMsgId: nowPlayingMsg?.messageId,
            },
        })
        return
    }

    // Find the recommendation for this specific track (narrow by guild + trackUrl)
    try {
        const prisma = getPrismaClient()
        const recommendation = await prisma.recommendation.findFirst({
            where: {
                guildId,
                ...(nowPlayingMsg.trackUrl && { url: nowPlayingMsg.trackUrl }),
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
        })

        if (!recommendation) {
            debugLog({
                message:
                    'Skipping skip-reason reaction: no recommendation found for track',
                data: {
                    guildId,
                    trackUrl: nowPlayingMsg.trackUrl,
                    messageId,
                },
            })
            return
        }

        // Record the skip reason non-blockingly
        await recordRecommendationSkipReason({
            recommendationId: recommendation.id,
            skipReason,
        })

        debugLog({
            message: 'Recorded skip reason from user reaction',
            data: {
                guildId,
                recommendationId: recommendation.id,
                skipReason,
            },
        })
    } catch (err) {
        errorLog({
            message: 'Error handling skip reason reaction:',
            error: err,
        })
    }
}

export function handleReactionEvents(client: Client): void {
    client.on(
        Events.MessageReactionAdd,
        async (
            reaction: MessageReaction | PartialMessageReaction,
            user: User | PartialUser,
        ) => {
            try {
                await handleGiveawayReaction(reaction, user)
                await handleSkipReasonReaction(reaction, user)
            } catch (error) {
                errorLog({ message: 'Error handling reaction:', error })
            }
        },
    )
}
