import type { Client } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, debugLog } from '@lukbot/shared/utils'
import { twitchNotificationService } from '@lukbot/shared/services'
import { getTwitchUserAccessToken } from './token'

const EVENTSUB_API_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const STREAM_ONLINE_TYPE = 'stream.online'
const STREAM_ONLINE_VERSION = '1'

export type NotificationPayload = {
    subscription: { type: string; condition: { broadcaster_user_id: string } }
    event: {
        id: string
        broadcaster_user_id: string
        broadcaster_user_login: string
        broadcaster_user_name: string
        type: string
        started_at: string
    }
}

export async function subscribeToStreamOnline(
    sessionId: string,
    clientId: string,
    subscribedUserIds: Set<string>,
): Promise<void> {
    const token = await getTwitchUserAccessToken()
    if (!token) return

    const userIds = await twitchNotificationService.getDistinctTwitchUserIds()
    if (userIds.length === 0) {
        debugLog({ message: 'Twitch EventSub: no streamers to subscribe to' })
        return
    }

    for (const broadcasterUserId of userIds) {
        if (subscribedUserIds.has(broadcasterUserId)) continue
        const ok = await createSubscription(
            broadcasterUserId,
            token,
            sessionId,
            clientId,
        )
        if (ok) subscribedUserIds.add(broadcasterUserId)
    }
}

async function createSubscription(
    broadcasterUserId: string,
    accessToken: string,
    sessionId: string,
    clientId: string,
): Promise<boolean> {
    try {
        const res = await fetch(EVENTSUB_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'Client-Id': clientId,
            },
            body: JSON.stringify({
                type: STREAM_ONLINE_TYPE,
                version: STREAM_ONLINE_VERSION,
                condition: { broadcaster_user_id: broadcasterUserId },
                transport: { method: 'websocket', session_id: sessionId },
            }),
        })
        if (!res.ok) {
            const text = await res.text()
            errorLog({
                message: `Twitch EventSub: create subscription failed ${res.status}`,
                data: text,
            })
            return false
        }
        debugLog({
            message: `Twitch EventSub: subscribed to stream.online for ${broadcasterUserId}`,
        })
        return true
    } catch (err) {
        errorLog({
            message: 'Twitch EventSub: create subscription error',
            error: err,
        })
        return false
    }
}

export async function handleStreamOnline(
    payload: NotificationPayload,
    client: Client,
): Promise<void> {
    const {
        broadcaster_user_id: twitchUserId,
        broadcaster_user_login: login,
        broadcaster_user_name: name,
        started_at: startedAt,
    } = payload.event

    const notifications =
        await twitchNotificationService.getNotificationsByTwitchUserId(
            twitchUserId,
        )
    if (notifications.length === 0) return

    const streamUrl = `https://twitch.tv/${login}`
    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle(`${name} is live`)
        .setURL(streamUrl)
        .setDescription(`**${name}** is now streaming on Twitch.`)
        .addFields({ name: 'Channel', value: streamUrl, inline: false })
        .setTimestamp(new Date(startedAt))
        .setFooter({ text: 'Twitch' })

    for (const notif of notifications) {
        try {
            const channel = await client.channels.fetch(notif.discordChannelId)
            if (channel?.isTextBased() && !channel.isDMBased()) {
                await channel.send({ embeds: [embed] })
            }
        } catch (err) {
            errorLog({
                message: `Twitch EventSub: failed to send notification to channel ${notif.discordChannelId}`,
                error: err,
            })
        }
    }
}
