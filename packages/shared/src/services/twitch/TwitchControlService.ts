import RedisClientClass, { type Redis } from 'ioredis'
import { createRedisConfig } from '../redis/config.js'
import { debugLog, errorLog, infoLog } from '../../utils/general/log.js'

/** Redis pub/sub channel carrying "re-read your Twitch subscriptions" signals. */
export const CHANNEL_TWITCH_REFRESH = 'twitch:refresh'

/**
 * Lightweight Redis pub/sub bridge that lets the backend tell the running bot
 * to re-read its Twitch notification subscriptions.
 *
 * Without it, a channel added or removed through the web dashboard is written
 * to Postgres but never registered as an EventSub subscription until the bot
 * restarts — the original "Twitch not working from the dashboard" report
 * (#870). The Discord `/twitch` commands already call
 * `refreshTwitchSubscriptions()` in-process; this gives the web path parity.
 *
 * Mirrors {@link MusicControlService}'s connection handling (separate
 * publisher/subscriber clients, best-effort connect) — the one Redis use the
 * codebase intentionally keeps.
 */
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
            debugLog({ message: 'TwitchControlService disconnected' })
        } catch (error) {
            errorLog({
                message: 'TwitchControlService disconnect error:',
                error,
            })
        }
    }

    /**
     * True when both pub/sub connections are established and ready. False
     * before connect(), after a failed connect, or while ioredis is
     * reconnecting after Redis went away.
     */
    isHealthy(): boolean {
        return (
            this.publisher?.status === 'ready' &&
            this.subscriber?.status === 'ready'
        )
    }

    /**
     * Signal every listening bot to refresh its Twitch subscriptions.
     *
     * Fire-and-forget: if Redis is unavailable the dashboard write still
     * landed in Postgres and the bot picks it up on its next restart, so a
     * skipped/failed publish is logged but never surfaced to the caller.
     */
    async publishRefresh(): Promise<void> {
        if (!this.isHealthy() || !this.publisher) {
            debugLog({
                message:
                    'TwitchControlService: skipping refresh publish (Redis not ready)',
            })
            return
        }
        try {
            await this.publisher.publish(CHANNEL_TWITCH_REFRESH, '1')
        } catch (error) {
            errorLog({
                message: 'TwitchControlService: refresh publish failed',
                error,
            })
        }
    }

    /**
     * Run `handler` whenever a refresh signal arrives. Handler errors are
     * logged and swallowed so one bad refresh can't tear down the subscriber.
     */
    async subscribeToRefresh(handler: () => Promise<void>): Promise<void> {
        if (!this.subscriber) return
        await this.subscriber.subscribe(CHANNEL_TWITCH_REFRESH)
        this.subscriber.on('message', async (ch: string) => {
            if (ch !== CHANNEL_TWITCH_REFRESH) return
            try {
                await handler()
            } catch (error) {
                errorLog({
                    message: 'TwitchControlService: refresh handler failed',
                    error,
                })
            }
        })
        infoLog({ message: 'Subscribed to Twitch refresh signals' })
    }
}

export const twitchControlService = new TwitchControlService()
