import type { Client, TextChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
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
            // Get all purge configs due for execution (every 5 minutes if never run, or if last run was >= intervalMinutes ago)
            const dueConfigs = await channelCleanupService.getPurgeConfigsDue()

            debugLog({
                message: 'Channel purge scheduler tick',
                data: { dueConfigs: dueConfigs.length },
            })

            for (const config of dueConfigs) {
                try {
                    const channel = await this.client.channels
                        .fetch(config.channelId)
                        .catch(() => null)

                    if (!channel || !channel.isTextBased()) {
                        debugLog({
                            message: 'Channel not found or not text-based',
                            data: { channelId: config.channelId },
                        })
                        continue
                    }

                    const textChannel = channel as TextChannel

                    // Bulk delete recent messages up to 5 times (Discord limits bulk delete to 100 messages, and only for messages <14 days old)
                    let deletedTotal = 0
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
                            // Ignore errors for individual bulkDelete attempts
                            debugLog({
                                message: 'Error bulk deleting messages',
                                data: {
                                    channelId: config.channelId,
                                    attempt: i + 1,
                                },
                            })
                            break
                        }
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
        } catch (error) {
            errorLog({
                message: 'Error in channel purge scheduler tick',
                error,
            })
        } finally {
            this.tickInProgress = false
        }
    }
}

/** Singleton instance of ChannelPurgeScheduler. */
export const channelPurgeScheduler = new ChannelPurgeScheduler()
