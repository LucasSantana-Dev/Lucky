import type { Client, TextChannel, Message } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { getTwitchUserAccessToken } from '../twitch'
import { throwIfRetryable, withRetry } from '../utils/httpRetryStrategy'

const RETRYABLE_STATUSES = [
    429,
    ...Array.from({ length: 100 }, (_, index) => 500 + index),
]

const TWITCH_POLL_INTERVAL_MS = 5 * 60 * 1000
const YOUTUBE_POLL_INTERVAL_MS = 30 * 60 * 1000
const MESSAGE_TTL_MS = 4 * 60 * 60 * 1000

type TwitchStream = {
    id: string
    user_login: string
    title: string
    viewer_count: number
    game_name: string
    thumbnail_url: string
    started_at: string
}

type YouTubeVideo = {
    id: string
    title: string
    thumbnail: string
    channelTitle: string
}

type NotificationMessage = {
    platform: 'twitch' | 'youtube'
    streamId: string
    postedAt: number
}

export class CriativariaLiveNotificationService {
    private readonly clock: () => number
    private readonly twitchPollIntervalMs: number
    private readonly youtubePollIntervalMs: number
    private lastNotifiedStreamId: string | null = null
    private lastNotifiedYoutubeBroadcastId: string | null = null
    private postedMessages: Map<string, NotificationMessage> = new Map()
    private twitchIntervalHandle: ReturnType<typeof setInterval> | null = null
    private youtubeIntervalHandle: ReturnType<typeof setInterval> | null = null
    private twitchTickInProgress = false
    private youtubeTickInProgress = false

    constructor(
        clock = () => Date.now(),
        twitchPollIntervalMs = TWITCH_POLL_INTERVAL_MS,
        youtubePollIntervalMs = YOUTUBE_POLL_INTERVAL_MS,
    ) {
        this.clock = clock
        this.twitchPollIntervalMs = twitchPollIntervalMs
        this.youtubePollIntervalMs = youtubePollIntervalMs
    }

    start(client: Client): void {
        const channelId = process.env.CRIATIVARIA_LIVES_CHANNEL_ID
        const userLogin = process.env.CRIATIVARIA_TWITCH_USER_LOGIN
        const youtubeApiKey = process.env.YOUTUBE_API_KEY
        const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID

        if (!channelId) {
            infoLog({
                message:
                    'CriativariaLiveNotification: CRIATIVARIA_LIVES_CHANNEL_ID not set, skipping all',
            })
            return
        }

        if (userLogin) {
            void this.twitchTick(client)
            this.twitchIntervalHandle = setInterval(
                () => void this.twitchTick(client),
                this.twitchPollIntervalMs,
            )
        } else {
            infoLog({
                message:
                    'CriativariaLiveNotification: CRIATIVARIA_TWITCH_USER_LOGIN not set, Twitch polling disabled',
            })
        }

        if (youtubeApiKey && youtubeChannelId) {
            void this.youtubeTick(client)
            this.youtubeIntervalHandle = setInterval(
                () => void this.youtubeTick(client),
                this.youtubePollIntervalMs,
            )
        } else {
            infoLog({
                message:
                    'CriativariaLiveNotification: YouTube credentials not set, YouTube polling disabled',
            })
        }
    }

    stop(): void {
        if (this.twitchIntervalHandle) {
            clearInterval(this.twitchIntervalHandle)
            this.twitchIntervalHandle = null
        }
        if (this.youtubeIntervalHandle) {
            clearInterval(this.youtubeIntervalHandle)
            this.youtubeIntervalHandle = null
        }
    }

    private async twitchTick(client: Client): Promise<void> {
        if (this.twitchTickInProgress) return
        this.twitchTickInProgress = true
        try {
            await this.checkAndNotifyTwitch(client)
            await this.cleanupStaleMessages(client)
        } catch (err) {
            errorLog({
                message: 'CriativariaLiveNotification: Twitch tick error',
                error: err,
            })
        } finally {
            this.twitchTickInProgress = false
        }
    }

    private async youtubeTick(client: Client): Promise<void> {
        if (this.youtubeTickInProgress) return
        this.youtubeTickInProgress = true
        try {
            await this.checkAndNotifyYoutube(client)
        } catch (err) {
            errorLog({
                message: 'CriativariaLiveNotification: YouTube tick error',
                error: err,
            })
        } finally {
            this.youtubeTickInProgress = false
        }
    }

    async checkAndNotifyTwitch(client: Client): Promise<void> {
        const channelId = process.env.CRIATIVARIA_LIVES_CHANNEL_ID
        const userLogin = process.env.CRIATIVARIA_TWITCH_USER_LOGIN
        if (!channelId || !userLogin) return

        const stream = await this.fetchStream(userLogin)

        if (!stream) {
            this.lastNotifiedStreamId = null
            return
        }
        if (stream.id === this.lastNotifiedStreamId) return

        this.lastNotifiedStreamId = stream.id

        try {
            const channel = await client.channels.fetch(channelId)
            if (!channel || !('send' in channel)) return

            const thumbnail = stream.thumbnail_url
                .replace('{width}', '1280')
                .replace('{height}', '720')

            const embed = new EmbedBuilder()
                .setColor(0xe879a0)
                .setTitle('🔴 Criativaria está ao vivo!')
                .setURL(`https://twitch.tv/${userLogin}`)
                .setDescription(stream.title || 'Sem título')
                .addFields(
                    {
                        name: 'Viewers',
                        value: stream.viewer_count.toLocaleString('pt-BR'),
                        inline: true,
                    },
                    {
                        name: 'Categoria',
                        value: stream.game_name || '—',
                        inline: true,
                    },
                )
                .setImage(thumbnail)
                .setTimestamp(new Date(stream.started_at))
                .setFooter({ text: 'Twitch' })

            const mentionRoleId = process.env.CRIATIVARIA_LIVE_MENTION_ROLE_ID
            const content = mentionRoleId ? `<@&${mentionRoleId}>` : undefined

            const message = (await (channel as TextChannel).send({
                content,
                embeds: [embed],
                allowedMentions: mentionRoleId
                    ? { roles: [mentionRoleId] }
                    : undefined,
            })) as Message

            this.postedMessages.set(message.id, {
                platform: 'twitch',
                streamId: stream.id,
                postedAt: this.clock(),
            })
        } catch (err) {
            errorLog({
                message: 'CriativariaLiveNotification: send failed',
                error: err,
            })
        }
    }

    async checkAndNotifyYoutube(client: Client): Promise<void> {
        const channelId = process.env.CRIATIVARIA_LIVES_CHANNEL_ID
        const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID
        const youtubeApiKey = process.env.YOUTUBE_API_KEY

        if (!channelId || !youtubeChannelId || !youtubeApiKey) return

        const broadcast = await this.fetchYoutubeLiveBroadcast(
            youtubeChannelId,
            youtubeApiKey,
        )

        if (!broadcast) {
            this.lastNotifiedYoutubeBroadcastId = null
            return
        }
        if (broadcast.id === this.lastNotifiedYoutubeBroadcastId) return

        this.lastNotifiedYoutubeBroadcastId = broadcast.id

        try {
            const channel = await client.channels.fetch(channelId)
            if (!channel || !('send' in channel)) return

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🔴 Criativaria está ao vivo no YouTube!')
                .setURL(`https://youtube.com/watch?v=${broadcast.id}`)
                .setDescription(broadcast.title || 'Sem título')
                .setImage(broadcast.thumbnail)
                .setFooter({ text: 'YouTube' })

            const mentionRoleId = process.env.CRIATIVARIA_LIVE_MENTION_ROLE_ID
            const content = mentionRoleId ? `<@&${mentionRoleId}>` : undefined

            const message = (await (channel as TextChannel).send({
                content,
                embeds: [embed],
                allowedMentions: mentionRoleId
                    ? { roles: [mentionRoleId] }
                    : undefined,
            })) as Message

            this.postedMessages.set(message.id, {
                platform: 'youtube',
                streamId: broadcast.id,
                postedAt: this.clock(),
            })
        } catch (err) {
            errorLog({
                message: 'CriativariaLiveNotification: YouTube send failed',
                error: err,
            })
        }
    }

    private async cleanupStaleMessages(client: Client): Promise<void> {
        const channelId = process.env.CRIATIVARIA_LIVES_CHANNEL_ID
        if (!channelId) return

        const now = this.clock()
        const channel = await client.channels.fetch(channelId).catch(() => null)
        if (!channel || !('messages' in channel)) return

        const messagesToDelete: string[] = []

        for (const [msgId, msg] of this.postedMessages.entries()) {
            if (now - msg.postedAt > MESSAGE_TTL_MS) {
                messagesToDelete.push(msgId)
                try {
                    await (channel as TextChannel).messages.delete(msgId)
                } catch (err) {
                    const errMsg =
                        err instanceof Error ? err.message : String(err)
                    if (errMsg.includes('Unknown Message')) {
                        // already gone; not a real failure
                    } else {
                        warnLog({
                            message: `CriativariaLiveNotification: failed to delete message ${msgId}`,
                            error: err,
                        })
                    }
                    messagesToDelete.push(msgId)
                }
            }
        }

        for (const msgId of messagesToDelete) {
            this.postedMessages.delete(msgId)
        }
    }

    async fetchStream(userLogin: string): Promise<TwitchStream | null> {
        const token = await getTwitchUserAccessToken()
        const clientId = process.env.TWITCH_CLIENT_ID
        if (!token || !clientId) return null

        try {
            const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(userLogin)}`
            const res = await withRetry(
                'criativaria.fetchStream',
                async () => {
                    const r = await fetch(url, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Client-Id': clientId,
                        },
                        signal: AbortSignal.timeout(10_000),
                    })
                    throwIfRetryable(r, RETRYABLE_STATUSES)
                    return r
                },
                2,
                {
                    retryableStatuses: RETRYABLE_STATUSES,
                    retryNetworkErrors: true,
                },
            )
            if (!res.ok) return null
            const json = (await res.json()) as { data: TwitchStream[] }
            return json.data?.[0] ?? null
        } catch {
            return null
        }
    }

    /**
     * Fetch active YouTube live broadcast for a channel.
     * Single search.list call (channelId + eventType=live) = 100 quota units.
     * At the 30-min interval: 48 checks/day × 100 = 4.8k units/day, inside the
     * 10k/day free quota with headroom for retries.
     * Interval: 30 min (not 10 min; 10 min would burn 14.4k units/day, exceeding quota).
     */
    async fetchYoutubeLiveBroadcast(
        channelId: string,
        apiKey: string,
    ): Promise<YouTubeVideo | null> {
        try {
            const searchRes = await withRetry(
                'criativaria.fetchYoutubeLiveBroadcast',
                async () => {
                    const r = await fetch(
                        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&type=video&eventType=live&maxResults=1&key=${encodeURIComponent(apiKey)}`,
                        { signal: AbortSignal.timeout(10_000) },
                    )
                    throwIfRetryable(r, RETRYABLE_STATUSES)
                    return r
                },
                2,
                {
                    retryableStatuses: RETRYABLE_STATUSES,
                    retryNetworkErrors: true,
                },
            )
            if (!searchRes.ok) return null

            const searchData = (await searchRes.json()) as {
                items: Array<{
                    id: { videoId: string }
                    snippet: {
                        title: string
                        channelTitle?: string
                        thumbnails: { default: { url: string } }
                    }
                }>
            }
            const video = searchData.items?.[0]
            if (!video) return null

            return {
                id: video.id.videoId,
                title: video.snippet.title,
                thumbnail: video.snippet.thumbnails?.default?.url || '',
                channelTitle: video.snippet?.channelTitle || 'YouTube',
            }
        } catch {
            return null
        }
    }
}

export const criativariaLiveNotificationService =
    new CriativariaLiveNotificationService()
