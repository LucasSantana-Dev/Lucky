import { randomInt } from 'node:crypto'

import type { Client, TextChannel, Message } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { getTwitchUserAccessToken } from '../twitch/token'

const TWITCH_POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes per spec
// Issue #130 asks 10 min, but search.list costs 100 quota units: 10-min polling
// burns 14.4k units/day against the 10k/day free quota. 30 min = 4.8k/day, safe.
const YOUTUBE_POLL_INTERVAL_MS = 30 * 60 * 1000
const MESSAGE_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

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

// Track posted notification messages: { msgId -> { platform, streamId, postedAt } }
// TTL cleanup on offline or 4h elapsed. Survives process restart if using Prisma (future).
type NotificationMessage = {
    platform: 'twitch' | 'youtube'
    streamId: string
    postedAt: number
}

// Jitter uses crypto.randomInt purely to satisfy S2245 — backoff spread is not
// security-sensitive, but the gate treats Math.random as a finding.
function jitterMs(): number {
    return randomInt(0, 1000)
}

// Exponential backoff helper: respects Retry-After, with jitter.
// Usage: backoffFetch(url, options, 3) returns response or throws after 3 attempts.
async function backoffFetch(
    url: string,
    options: Record<string, unknown>,
    maxAttempts = 3,
): Promise<Response> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const res = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(10_000),
            } as RequestInit)
            // If 429 or 5xx, backoff and retry
            if (
                (res.status === 429 || res.status >= 500) &&
                attempt < maxAttempts - 1
            ) {
                const retryAfter = res.headers.get('Retry-After')
                let delayMs: number
                if (retryAfter) {
                    // Try parsing as integer seconds first
                    const seconds = parseInt(retryAfter, 10)
                    if (!isNaN(seconds) && seconds > 0) {
                        delayMs = Math.min(seconds * 1000, 30000)
                    } else {
                        // Try parsing as HTTP-date (e.g., "Wed, 21 Oct 2026 07:28:00 GMT")
                        const dateMs = Date.parse(retryAfter)
                        const waitMs = dateMs - Date.now()
                        if (!isNaN(dateMs) && waitMs > 0) {
                            delayMs = Math.min(waitMs, 30000)
                        } else {
                            // Fall back to exponential+jitter
                            delayMs = Math.min(
                                1000 * Math.pow(2, attempt) + jitterMs(),
                                30000,
                            )
                        }
                    }
                } else {
                    delayMs = Math.min(
                        1000 * Math.pow(2, attempt) + jitterMs(),
                        30000,
                    )
                }
                await new Promise((resolve) => setTimeout(resolve, delayMs))
                continue
            }
            return res
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            if (attempt < maxAttempts - 1) {
                const delayMs = Math.min(
                    1000 * Math.pow(2, attempt) + jitterMs(),
                    30000,
                )
                await new Promise((resolve) => setTimeout(resolve, delayMs))
            }
        }
    }
    throw (
        lastError ||
        new Error(`Backoff exhausted after ${maxAttempts} attempts`)
    )
}

export class CriativariaLiveNotificationService {
    private readonly clock: () => number
    private readonly twitchPollIntervalMs: number
    private readonly youtubePollIntervalMs: number
    private lastNotifiedStreamId: string | null = null
    private lastNotifiedYoutubeBroadcastId: string | null = null
    // In-memory tracking of posted messages. Future: migrate to Prisma LiveNotificationMessage.
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

        // Check if we can post anywhere: need Discord channel for both
        if (!channelId) {
            infoLog({
                message:
                    'CriativariaLiveNotification: CRIATIVARIA_LIVES_CHANNEL_ID not set, skipping all',
            })
            return
        }

        // Start Twitch polling if Twitch login is configured
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

        // Start YouTube polling if YouTube credentials are configured
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

            // Track posted message for TTL cleanup
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
                .setColor(0xff0000) // YouTube red
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

            // Track posted message for TTL cleanup
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
            // Delete if TTL (4h) elapsed
            if (now - msg.postedAt > MESSAGE_TTL_MS) {
                messagesToDelete.push(msgId)
                try {
                    await (channel as TextChannel).messages.delete(msgId)
                } catch (err) {
                    // Fail soft: already deleted or permission issue
                    const errMsg =
                        err instanceof Error ? err.message : String(err)
                    if (errMsg.includes('Unknown Message')) {
                        // Already deleted, just remove from tracking
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

        // Cleanup map
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
            const res = await backoffFetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Client-Id': clientId,
                },
            })
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
            const searchRes = await backoffFetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&type=video&eventType=live&maxResults=1&key=${encodeURIComponent(apiKey)}`,
                {},
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
