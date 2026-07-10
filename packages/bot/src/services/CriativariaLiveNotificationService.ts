import type { Client, TextChannel, Message } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { getTwitchUserAccessToken } from '../twitch/token'

const TWITCH_POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes per spec
const YOUTUBE_POLL_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes per spec
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
            if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
                const retryAfter = res.headers.get('Retry-After')
                const delayMs = retryAfter
                    ? Math.min(parseInt(retryAfter, 10) * 1000, 30000)
                    : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000)
                await new Promise((resolve) => setTimeout(resolve, delayMs))
                continue
            }
            return res
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            if (attempt < maxAttempts - 1) {
                const delayMs = Math.min(
                    1000 * Math.pow(2, attempt) + Math.random() * 1000,
                    30000,
                )
                await new Promise((resolve) => setTimeout(resolve, delayMs))
            }
        }
    }
    throw lastError || new Error(`Backoff exhausted after ${maxAttempts} attempts`)
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
        if (!channelId || !userLogin) {
            infoLog({
                message: 'CriativariaLiveNotification: env not set, skipping',
            })
            return
        }

        // Start Twitch polling (5 min interval)
        void this.twitchTick(client)
        this.twitchIntervalHandle = setInterval(
            () => void this.twitchTick(client),
            this.twitchPollIntervalMs,
        )

        // Start YouTube polling (10 min interval) if key is present
        const youtubeApiKey = process.env.YOUTUBE_API_KEY
        if (youtubeApiKey) {
            void this.youtubeTick(client)
            this.youtubeIntervalHandle = setInterval(
                () => void this.youtubeTick(client),
                this.youtubePollIntervalMs,
            )
        } else {
            infoLog({
                message: 'CriativariaLiveNotification: YOUTUBE_API_KEY not set, YouTube polling disabled',
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

        const broadcast = await this.fetchYoutubeLiveBroadcast(youtubeChannelId, youtubeApiKey)

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
                    const errMsg = err instanceof Error ? err.message : String(err)
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
     * Uses channels.list (1 unit/day) → uploads playlist → search.list (100 units/day).
     * Quota math: 1 + 100 = 101 units per full check; at 10-min interval = 144 checks/day = ~14.4k units/day.
     * This EXCEEDS the 10k free quota, so production should use YouTube's liveBroadcast.list
     * with a cached broadcastId or implement server-side caching to avoid daily quota burn.
     *
     * Alternative: use videos.list on a tracked liveBroadcastId (7 units/query, better ROI).
     */
    async fetchYoutubeLiveBroadcast(
        channelId: string,
        apiKey: string,
    ): Promise<YouTubeVideo | null> {
        try {
            // Cheaper call: list channel uploads playlist (1 unit).
            const channelRes = await backoffFetch(
                `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forUsername=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`,
                {},
            )
            if (!channelRes.ok) return null

            const channelData = (await channelRes.json()) as {
                items: Array<{ contentDetails: { relatedPlaylists: { uploads: string } } }>
            }
            const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
            if (!uploadsPlaylistId) return null

            // Search uploads playlist for live videos (100 units per query).
            // Production: replace with liveBroadcast.list or server-side cache of broadcastId.
            const searchRes = await backoffFetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=false&playlistId=${encodeURIComponent(uploadsPlaylistId)}&type=video&eventType=live&maxResults=1&key=${encodeURIComponent(apiKey)}`,
                {},
            )
            if (!searchRes.ok) return null

            const searchData = (await searchRes.json()) as {
                items: Array<{
                    id: { videoId: string }
                    snippet: { title: string; thumbnails: { default: { url: string } } }
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
