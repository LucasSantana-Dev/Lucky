import type { Client, TextChannel } from 'discord.js'
import { channelCleanupService, serverLogService } from '@lucky/shared/services'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'

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

                let deletedTotal = 0
                let purgeFailed = false
                let lastErrorMessage = 'Unknown purge failure'
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
                        lastErrorMessage =
                            innerError instanceof Error
                                ? innerError.message
                                : String(innerError)
                        purgeFailed = true
                        break
                    }
                }

                if (purgeFailed) {
                    try {
                        const updated =
                            await channelCleanupService.recordPurgeFailure(
                                config.id,
                                lastErrorMessage,
                            )
                        if (!updated.enabled) {
                            errorLog({
                                message:
                                    'Channel purge auto-disabled after repeated failures',
                                data: {
                                    channelId: config.channelId,
                                    guildId: config.guildId,
                                    consecutiveFailures:
                                        updated.consecutiveFailures,
                                    lastError: updated.lastError,
                                },
                            })
                            try {
                                await serverLogService.createLog(
                                    config.guildId,
                                    'mod_action',
                                    'Channel purge auto-disabled after repeated failures',
                                    {
                                        consecutiveFailures:
                                            updated.consecutiveFailures,
                                        lastError: updated.lastError,
                                        configId: config.id,
                                    },
                                    { channelId: config.channelId },
                                )
                            } catch (logError) {
                                errorLog({
                                    message:
                                        'Failed to log channel purge auto-disable audit entry',
                                    error: logError,
                                    data: {
                                        channelId: config.channelId,
                                        guildId: config.guildId,
                                    },
                                })
                            }
                        }
                    } catch (recordError) {
                        errorLog({
                            message: 'Failed to record channel purge failure',
                            error: recordError,
                            data: {
                                channelId: config.channelId,
                                guildId: config.guildId,
                            },
                        })
                    }
                    continue
                }

                await channelCleanupService.markPurgeExecuted(config.id)

                try {
                    await serverLogService.createLog(
                        config.guildId,
                        'mod_action',
                        'Channel purge executed',
                        {
                            deletedMessages: deletedTotal,
                            configId: config.id,
                        },
                        { channelId: config.channelId },
                    )
                } catch (logError) {
                    errorLog({
                        message: 'Failed to log channel purge audit entry',
                        error: logError,
                        data: {
                            channelId: config.channelId,
                            guildId: config.guildId,
                        },
                    })
                }

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
}

/** Singleton instance of ChannelPurgeScheduler. */
export const channelPurgeScheduler = new ChannelPurgeScheduler()
