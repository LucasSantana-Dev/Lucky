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
            } catch (error) {
                errorLog({ message: 'Error handling reaction:', error })
            }
        },
    )
}
