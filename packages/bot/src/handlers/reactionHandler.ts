import {
    Events,
    type Client,
    type MessageReaction,
    type User,
    type PartialMessageReaction,
    type PartialUser,
    type TextChannel,
} from 'discord.js'
import { starboardService, giveawayService } from '@lucky/shared/services'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { getSongInfoMessage } from './player/trackNowPlaying'
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

export async function handleStarboardReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    client: Client,
): Promise<void> {
    if (reaction.partial) await reaction.fetch()
    if (user.partial) await user.fetch()
    if (!reaction.message.guild) return
    if (user.bot) return

    const guildId = reaction.message.guild.id
    const config = await starboardService.getConfig(guildId)
    if (!config) return

    const emoji = reaction.emoji.name ?? ''
    if (emoji !== config.emoji) return

    const msg = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message

    if (!config.selfStar && msg.author?.id === user.id) return

    // One-time DM introducing the starboard the first time a member stars
    // anything (per-guild opt-in; text overridable per guild).
    if (config.firstStarDm) {
        const first = await starboardService
            .tryClaimFirstStarDm(guildId, user.id)
            .catch(() => false)
        if (first) {
            const dmText =
                config.firstStarDmMessage ??
                `${config.emoji} You just starred a message! When a message collects ${config.threshold}× ${config.emoji}, it gets featured in <#${config.channelId}>.`
            await (user as User).send(dmText).catch(() => undefined)
        }
    }

    // The bot's own seed reaction must never count toward the threshold.
    const starCount = Math.max(0, (reaction.count ?? 1) - (reaction.me ? 1 : 0))
    const entry = await starboardService.upsertEntry(guildId, msg.id, {
        channelId: msg.channelId,
        authorId: msg.author?.id ?? '',
        content: msg.content ?? undefined,
        starCount,
    })

    if (starCount < config.threshold) return

    const rawChannel = await client.channels
        .fetch(config.channelId)
        .catch(() => null)
    if (!rawChannel || !rawChannel.isTextBased()) return
    const channel = rawChannel as TextChannel

    const starEmbed = {
        color: 0xffd700,
        description: msg.content ?? '*(no text content)*',
        fields: [{ name: 'Source', value: `[Jump to message](${msg.url})` }],
        footer: {
            text: `${config.emoji} ${starCount} • #${msg.channel && 'name' in msg.channel ? msg.channel.name : 'unknown'}`,
        },
        author: {
            name: msg.author?.username ?? 'Unknown',
            icon_url: msg.author?.displayAvatarURL() ?? undefined,
        },
    }

    if (entry.starboardMsgId) {
        const starMsg = await channel.messages
            .fetch(entry.starboardMsgId)
            .catch(() => null)
        if (starMsg) await starMsg.edit({ embeds: [starEmbed] })
    } else {
        const posted = await channel.send({ embeds: [starEmbed] })
        await starboardService.upsertEntry(guildId, msg.id, {
            channelId: msg.channelId,
            authorId: msg.author?.id ?? '',
            content: msg.content ?? undefined,
            starCount,
            starboardMsgId: posted.id,
        })
    }
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
                await handleStarboardReaction(reaction, user, client)
                await handleSkipReasonReaction(reaction, user)
            } catch (error) {
                errorLog({ message: 'Error handling reaction:', error })
            }
        },
    )
}
