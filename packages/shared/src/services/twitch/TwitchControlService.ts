import RedisClientClass, { type Redis } from 'ioredis'
import { createRedisConfig } from '../redis/config.js'
import { errorLog, infoLog } from '../../utils/general/log.js'

export const CHANNEL_TWITCH_REFRESH = 'twitch:refresh'

export class TwitchControlService {
    private publisher: Redis | null = null
    private subscriber: Redis | null = null

    async connect(): Promise<void> {
        try {
            const config = createRedisConfig()
            this.publisher = new RedisClientClass(config) as Redis
            this.subscriber = new RedisClientClass(config) as Redis
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect(),
            ])
            infoLog({ message: 'TwitchControlService connected to Redis' })
        } catch (error) {
            errorLog({
                message: 'TwitchControlService failed to connect:',
                error,
            })
        }
    }

    async disconnect(): Promise<void> {
        try {
            if (this.subscriber) {
                await this.subscriber.unsubscribe()
                await this.subscriber.disconnect()
            }
            if (this.publisher) await this.publisher.disconnect()
        } catch (error) {
            errorLog({
                message: 'TwitchControlService disconnect error:',
                error,
            })
        }
    }

    isHealthy(): boolean {
        return (
            this.publisher?.status === 'ready' &&
            this.subscriber?.status === 'ready'
        )
    }

    publishRefresh(): void {
        if (!this.publisher) return
        this.publisher
            .publish(CHANNEL_TWITCH_REFRESH, 'refresh')
            .catch((err: unknown) => {
                errorLog({
                    message: 'Error publishing twitch refresh:',
                    error: err,
                })
            })
    }

    async onRefresh(cb: () => void): Promise<void> {
        if (!this.subscriber) return
        await this.subscriber.subscribe(CHANNEL_TWITCH_REFRESH)
        this.subscriber.on('message', (ch: string, _msg: string) => {
            if (ch !== CHANNEL_TWITCH_REFRESH) return
            try {
                cb()
            } catch (error) {
                errorLog({ message: 'Error handling twitch refresh:', error })
            }
        })
        infoLog({ message: 'Subscribed to twitch refresh notifications' })
    }
}

export const twitchControlService = new TwitchControlService()
