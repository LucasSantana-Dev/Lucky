import type { Client } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { twitchNotificationService } from '@lucky/shared/services'
import { getTwitchUserAccessToken } from './token'

const EVENTSUB_API_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const STREAM_ONLINE_TYPE = 'stream.online'
const STREAM_ONLINE_VERSION = '1'
const STREAM_OFFLINE_TYPE = 'stream.offline'
const STREAM_OFFLINE_VERSION = '1'
const CHANNEL_UPDATE_TYPE = 'channel.update'
const CHANNEL_UPDATE_VERSION = '2'

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

export type StreamOfflinePayload = {
    subscription: { type: string; condition: { broadcaster_user_id: string } }
    event: {
        broadcaster_user_id: string
        broadcaster_user_login: string
        broadcaster_user_name: string
    }
}

export type ChannelUpdatePayload = {
    subscription: { type: string; condition: { broadcaster_user_id: string } }
    event: {
        broadcaster_user_id: string
        broadcaster_user_login: string
        broadcaster_user_name: string
        title: string
        category_id: string
        category_name: string
        content_classification_labels: string[]
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
            STREAM_ONLINE_TYPE,
            STREAM_ONLINE_VERSION,
        )
        if (ok) subscribedUserIds.add(broadcasterUserId)
    }
}

export async function subscribeToStreamOffline(
    sessionId: string,
    clientId: string,
    subscribedOfflineIds: Set<string>,
): Promise<void> {
    const token = await getTwitchUserAccessToken()
    if (!token) return

    const userIds = await twitchNotificationService.getDistinctTwitchUserIds()
    if (userIds.length === 0) {
        debugLog({ message: 'Twitch EventSub: no streamers to subscribe to' })
        return
    }

    for (const broadcasterUserId of userIds) {
        if (subscribedOfflineIds.has(broadcasterUserId)) continue
        const ok = await createSubscription(
            broadcasterUserId,
            token,
            sessionId,
            clientId,
            STREAM_OFFLINE_TYPE,
            STREAM_OFFLINE_VERSION,
        )
        if (ok) subscribedOfflineIds.add(broadcasterUserId)
    }
}

export async function subscribeToChannelUpdate(
    sessionId: string,
    clientId: string,
    subscribedUpdateIds: Set<string>,
): Promise<void> {
    const token = await getTwitchUserAccessToken()
    if (!token) return

    const userIds = await twitchNotificationService.getDistinctTwitchUserIds()
    if (userIds.length === 0) {
        debugLog({ message: 'Twitch EventSub: no streamers to subscribe to' })
        return
    }

    for (const broadcasterUserId of userIds) {
        if (subscribedUpdateIds.has(broadcasterUserId)) continue
        const ok = await createSubscription(
            broadcasterUserId,
            token,
            sessionId,
            clientId,
            CHANNEL_UPDATE_TYPE,
            CHANNEL_UPDATE_VERSION,
        )
        if (ok) subscribedUpdateIds.add(broadcasterUserId)
    }
}

async function createSubscription(
    broadcasterUserId: string,
    accessToken: string,
    sessionId: string,
    clientId: string,
    type: string,
    version: string,
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
                type,
                version,
                condition: { broadcaster_user_id: broadcasterUserId },
                transport: { method: 'websocket', session_id: sessionId },
            }),
            signal: AbortSignal.timeout(10_000),
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
            message: `Twitch EventSub: subscribed to ${type} for ${broadcasterUserId}`,
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
            if (!channel) {
                warnLog({
                    message:
                        'Twitch EventSub: channel not found (may be deleted or inaccessible)',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            if (!channel.isTextBased()) {
                warnLog({
                    message: 'Twitch EventSub: channel is not a text channel',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            if (channel.isDMBased()) {
                warnLog({
                    message:
                        'Twitch EventSub: channel is a DM channel, skipping',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            await channel.send({ embeds: [embed] })
        } catch (err) {
            errorLog({
                message: `Twitch EventSub: failed to send notification to channel ${notif.discordChannelId}`,
                error: err,
            })
        }
    }
}

export async function handleStreamOffline(
    payload: StreamOfflinePayload,
    client: Client,
): Promise<void> {
    const {
        broadcaster_user_id: twitchUserId,
        broadcaster_user_login: login,
        broadcaster_user_name: name,
    } = payload.event

    const notifications =
        await twitchNotificationService.getNotificationsByTwitchUserId(
            twitchUserId,
        )
    if (notifications.length === 0) return

    const embed = new EmbedBuilder()
        .setColor(0x6b7280)
        .setTitle(`${name} went offline`)
        .setURL(`https://twitch.tv/${login}`)
        .setDescription(`**${name}** ended their stream on Twitch.`)
        .setTimestamp()
        .setFooter({ text: 'Twitch' })

    for (const notif of notifications) {
        try {
            const channel = await client.channels.fetch(notif.discordChannelId)
            if (!channel) {
                warnLog({
                    message:
                        'Twitch EventSub: channel not found (may be deleted or inaccessible)',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            if (!channel.isTextBased()) {
                warnLog({
                    message: 'Twitch EventSub: channel is not a text channel',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            if (channel.isDMBased()) {
                warnLog({
                    message:
                        'Twitch EventSub: channel is a DM channel, skipping',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            await channel.send({ embeds: [embed] })
        } catch (err) {
            errorLog({
                message: `Twitch EventSub: failed to send notification to channel ${notif.discordChannelId}`,
                error: err,
            })
        }
    }
}

export async function handleChannelUpdate(
    payload: ChannelUpdatePayload,
    client: Client,
): Promise<void> {
    const {
        broadcaster_user_id: twitchUserId,
        broadcaster_user_login: login,
        broadcaster_user_name: name,
        title,
        category_name,
    } = payload.event

    const notifications =
        await twitchNotificationService.getNotificationsByTwitchUserId(
            twitchUserId,
        )
    if (notifications.length === 0) return

    const embed = new EmbedBuilder()
        .setColor(0x9146ff)
        .setTitle(`${name} updated their stream`)
        .setURL(`https://twitch.tv/${login}`)
        .addFields(
            { name: 'Title', value: title, inline: false },
            { name: 'Category', value: category_name || '—', inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Twitch' })

    for (const notif of notifications) {
        try {
            const channel = await client.channels.fetch(notif.discordChannelId)
            if (!channel) {
                warnLog({
                    message:
                        'Twitch EventSub: channel not found (may be deleted or inaccessible)',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            if (!channel.isTextBased()) {
                warnLog({
                    message: 'Twitch EventSub: channel is not a text channel',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            if (channel.isDMBased()) {
                warnLog({
                    message:
                        'Twitch EventSub: channel is a DM channel, skipping',
                    data: {
                        discordChannelId: notif.discordChannelId,
                        twitchLogin: notif.twitchLogin,
                    },
                })
                continue
            }
            await channel.send({ embeds: [embed] })
        } catch (err) {
            errorLog({
                message: `Twitch EventSub: failed to send notification to channel ${notif.discordChannelId}`,
                error: err,
            })
        }
    }
}
