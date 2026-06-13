import {
    Events,
    type Client,
    type MessageReaction,
    type User,
    type PartialMessageReaction,
    type PartialUser,
    type TextChannel,
} from 'discord.js'
import { starboardService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { activeGiveaways } from '../functions/general/commands/giveaway'
import { getSongInfoMessage } from './player/trackNowPlaying'
import { recordRecommendationSkipReason } from '../services/musicRecommendation/recommendationTelemetry'
import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'

// Map emoji names to skip reasons
const SKIP_REASON_MAP: Record<string, string> = {
    '👎': 'generic_dislike',
    '😴': 'too_chill',
    '🎸': 'mood_mismatch',
    '🔁': 'repeat',
}

async function handleGiveawayReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
): Promise<void> {
    if (user.bot) return
    if (user.partial) await user.fetch()

    const giveaway = activeGiveaways.get(reaction.message.id)
    if (!giveaway) return

    if (reaction.emoji.name === '🎉') {
        giveaway.entries.add(user.id)
    }
}

async function handleStarboardReaction(
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

    const msg = reaction.message.partial ? await reaction.message.fetch() : reaction.message

    if (!config.selfStar && msg.author?.id === user.id) return

    const starCount = reaction.count ?? 1
    const entry = await starboardService.upsertEntry(guildId, msg.id, {
        channelId: msg.channelId,
        authorId: msg.author?.id ?? '',
        content: msg.content ?? undefined,
        starCount,
    })

    if (starCount < config.threshold) return

    const rawChannel = await client.channels.fetch(config.channelId).catch(() => null)
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
        const starMsg = await channel.messages.fetch(entry.starboardMsgId).catch(() => null)
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
    if (user.bot) return
    if (reaction.partial) await reaction.fetch()
    if (!reaction.message.guild) return

    const guildId = reaction.message.guild.id
    const messageId = reaction.message.id
    const emojiName = reaction.emoji.name ?? ''

    // Check if this emoji is a skip-reason emoji
    const skipReason = SKIP_REASON_MAP[emojiName]
    if (!skipReason) return

    // Check if this message is the now-playing message for the guild
    const nowPlayingMsg = getSongInfoMessage(guildId)
    if (!nowPlayingMsg || nowPlayingMsg.messageId !== messageId) return

    // Find the most recent recommendation for this guild
    try {
        const prisma = getPrismaClient()
        const recommendation = await prisma.recommendation.findFirst({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
            take: 1,
        })

        if (!recommendation) return

        // Record the skip reason non-blockingly
        await recordRecommendationSkipReason({
            recommendationId: recommendation.id,
            skipReason,
        })
    } catch (err) {
        errorLog({ message: 'Error handling skip reason reaction:', error: err })
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
