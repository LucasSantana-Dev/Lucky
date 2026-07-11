import type { Client, TextChannel } from 'discord.js'
import { channelCleanupService } from '@lucky/shared/services'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'

// Tick every 5 minutes by default to check for channels due for purge
const DEFAULT_TICK_INTERVAL_MS = 5 * 60 * 1000

type ChannelPurgeSchedulerOptions = {
    tickIntervalMs?: number
}

function parsePositiveIntEnv(
    raw: string | undefined,
    fallback: number,
    name: string,
): number {
    if (raw === undefined) return fallback
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        errorLog({
            message: `Invalid ${name} env value, falling back to default`,
            data: { raw, fallback },
        })
        return fallback
    }
    return parsed
}

export class ChannelPurgeScheduler {
    private readonly tickIntervalMs: number
    private timer: ReturnType<typeof setInterval> | null = null
    private client: Client | null = null
    private tickInProgress = false

    constructor(options: ChannelPurgeSchedulerOptions = {}) {
        this.tickIntervalMs =
            options.tickIntervalMs ??
            parsePositiveIntEnv(
                process.env.CHANNEL_PURGE_TICK_INTERVAL_MS,
                DEFAULT_TICK_INTERVAL_MS,
                'CHANNEL_PURGE_TICK_INTERVAL_MS',
            )
    }

    start(client: Client): void {
        if (this.timer) return
        this.client = client
        infoLog({
            message: `Channel purge scheduler started (interval: ${this.tickIntervalMs}ms)`,
        })
        // Run once immediately on startup
        void this.tick()
        this.timer = setInterval(() => void this.tick(), this.tickIntervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
            infoLog({
                message: 'Channel purge scheduler stopped',
            })
        }
    }

    private async tick(): Promise<void> {
        if (this.tickInProgress || !this.client) return
        this.tickInProgress = true

        try {
            await this.processPurgeConfigs(this.client)

            // Durable TTL backstop: sweep expired messages in ttl-mode channels.
            // The per-message setTimeout in ttlDeleteHandler is lost on restart;
            // this tick (run on startup and every interval) reclaims any deletes
            // orphaned by downtime.
            await this.sweepTtlConfigs(this.client)
        } catch (error) {
            errorLog({
                message: 'Error in channel purge scheduler tick',
                error,
            })
        } finally {
            this.tickInProgress = false
        }
    }

    private async processPurgeConfigs(client: Client): Promise<void> {
        // Purge configs due for execution (never run, or last run >= intervalMinutes ago)
        const dueConfigs = await channelCleanupService.getPurgeConfigsDue()

        debugLog({
            message: 'Channel purge scheduler tick',
            data: { dueConfigs: dueConfigs.length },
        })

        for (const config of dueConfigs) {
            try {
                const channel = await client.channels
                    .fetch(config.channelId)
                    .catch(() => null)

                if (!channel || !channel.isTextBased()) {
                    debugLog({
                        message: 'Channel not found or not text-based',
                        data: { channelId: config.channelId },
                    })
                    continue
                }

                // Verify channel belongs to the configured guild
                if (
                    !('guild' in channel) ||
                    channel.guild?.id !== config.guildId
                ) {
                    debugLog({
                        message: 'Channel guild mismatch or no guild, skipping',
                        data: {
                            channelId: config.channelId,
                            configGuildId: config.guildId,
                            channelGuildId:
                                'guild' in channel
                                    ? channel.guild?.id
                                    : 'no-guild-property',
                        },
                    })
                    continue
                }

                const textChannel = channel as TextChannel

                // Bulk delete recent messages up to 5 times (Discord limits bulk delete to 100 messages, and only for messages <14 days old)
                let deletedTotal = 0
                let purgeFailed = false
                for (let i = 0; i < 5; i++) {
                    try {
                        const messages = await textChannel.messages.fetch({
                            limit: 100,
                        })

                        if (messages.size === 0) break

                        const deleted = await textChannel.bulkDelete(
                            messages,
                            true,
                        )
                        deletedTotal += deleted.size

                        if (deleted.size < 100) break
                    } catch (innerError) {
                        // Log at ERROR level for permission or other failures
                        // so they're visible for debugging, not just DEBUG
                        errorLog({
                            message:
                                'Error bulk deleting messages in channel purge',
                            error: innerError,
                            data: {
                                channelId: config.channelId,
                                guildId: config.guildId,
                                attempt: i + 1,
                            },
                        })
                        purgeFailed = true
                        break
                    }
                }

                // On a mid-purge failure (permission revoked, rate limit,
                // transient API error) leave lastRunAt untouched so the next
                // tick retries instead of silently dropping the remaining
                // messages.
                if (purgeFailed) {
                    continue
                }

                // Mark as executed
                await channelCleanupService.markPurgeExecuted(config.id)

                infoLog({
                    message: 'Channel purge executed',
                    data: {
                        channelId: config.channelId,
                        guildId: config.guildId,
                        deletedMessages: deletedTotal,
                    },
                })
            } catch (error) {
                errorLog({
                    message: 'Error executing channel purge',
                    error,
                    data: {
                        channelId: config.channelId,
                        guildId: config.guildId,
                    },
                })
            }
        }
    }

    private async sweepTtlConfigs(client: Client): Promise<void> {
        const ttlConfigs = await channelCleanupService.getTtlConfigs()
        if (ttlConfigs.length === 0) return

        const now = Date.now()
        for (const config of ttlConfigs) {
            const ttlSeconds = config.ttlSeconds
            // Same bounds the command enforces; skip malformed configs.
            if (!ttlSeconds || ttlSeconds < 5 || ttlSeconds > 86400) continue

            try {
                const channel = await client.channels
                    .fetch(config.channelId)
                    .catch(() => null)

                if (!channel || !channel.isTextBased()) continue
                if (
                    !('guild' in channel) ||
                    channel.guild?.id !== config.guildId
                ) {
                    continue
                }

                const textChannel = channel as TextChannel
                const messages = await textChannel.messages.fetch({
                    limit: 100,
                })
                // Match ttlDeleteHandler semantics: user messages only, expired
                // past their TTL. bulkDelete(filterOld=true) skips >14d messages.
                const expired = messages.filter(
                    (m) =>
                        !m.author.bot &&
                        now - m.createdTimestamp > ttlSeconds * 1000,
                )
                if (expired.size === 0) continue

                await textChannel.bulkDelete(expired, true)
            } catch (error) {
                errorLog({
                    message: 'Error sweeping TTL channel',
                    error,
                    data: {
                        channelId: config.channelId,
                        guildId: config.guildId,
                    },
                })
            }
        }
    }
}

/** Singleton instance of ChannelPurgeScheduler. */
export const channelPurgeScheduler = new ChannelPurgeScheduler()
