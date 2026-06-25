import type { Client, TextChannel } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { getTwitchUserAccessToken } from '../twitch/token'

const POLL_INTERVAL_MS = 2 * 60 * 1000

type TwitchStream = {
    id: string
    user_login: string
    title: string
    viewer_count: number
    game_name: string
    thumbnail_url: string
    started_at: string
}

export class CriativariaLiveNotificationService {
    private readonly clock: () => number
    private readonly pollIntervalMs: number
    private lastNotifiedStreamId: string | null = null
    private intervalHandle: ReturnType<typeof setInterval> | null = null
    private tickInProgress = false

    constructor(clock = () => Date.now(), pollIntervalMs = POLL_INTERVAL_MS) {
        this.clock = clock
        this.pollIntervalMs = pollIntervalMs
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
        void this.tick(client)
        this.intervalHandle = setInterval(
            () => void this.tick(client),
            this.pollIntervalMs,
        )
    }

    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle)
            this.intervalHandle = null
        }
    }

    private async tick(client: Client): Promise<void> {
        if (this.tickInProgress) return
        this.tickInProgress = true
        try {
            await this.checkAndNotify(client)
        } catch (err) {
            errorLog({
                message: 'CriativariaLiveNotification: tick error',
                error: err,
            })
        } finally {
            this.tickInProgress = false
        }
    }

    async checkAndNotify(client: Client): Promise<void> {
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

            await (channel as TextChannel).send({ embeds: [embed] })
        } catch (err) {
            errorLog({
                message: 'CriativariaLiveNotification: send failed',
                error: err,
            })
        }
    }

    async fetchStream(userLogin: string): Promise<TwitchStream | null> {
        const token = await getTwitchUserAccessToken()
        const clientId = process.env.TWITCH_CLIENT_ID
        if (!token || !clientId) return null

        try {
            const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(userLogin)}`
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Client-Id': clientId,
                },
                signal: AbortSignal.timeout(10_000),
            })
            if (!res.ok) return null
            const json = (await res.json()) as { data: TwitchStream[] }
            return json.data?.[0] ?? null
        } catch {
            return null
        }
    }
}

export const criativariaLiveNotificationService =
    new CriativariaLiveNotificationService()
