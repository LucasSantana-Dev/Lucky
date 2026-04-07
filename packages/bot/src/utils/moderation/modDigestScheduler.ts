import type { Client, TextChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
import { moderationService } from '@lucky/shared/services'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import {
    modDigestConfigService,
    type ModDigestConfig,
} from './modDigestConfig'
import { buildDigestEmbed } from './digestEmbed'

const DEFAULT_TICK_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_PERIOD_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

type ModDigestSchedulerOptions = {
    tickIntervalMs?: number
    periodDays?: number
    clock?: () => number
}

export class ModDigestSchedulerService {
    private readonly tickIntervalMs: number
    private readonly periodDays: number
    private readonly clock: () => number
    private timer: ReturnType<typeof setInterval> | null = null
    private client: Client | null = null

    constructor(options: ModDigestSchedulerOptions = {}) {
        this.tickIntervalMs =
            options.tickIntervalMs ??
            parseInt(
                process.env.MOD_DIGEST_TICK_INTERVAL_MS ??
                    `${DEFAULT_TICK_INTERVAL_MS}`,
                10,
            )
        this.periodDays =
            options.periodDays ??
            parseInt(
                process.env.MOD_DIGEST_PERIOD_DAYS ?? `${DEFAULT_PERIOD_DAYS}`,
                10,
            )
        this.clock = options.clock ?? (() => Date.now())
    }

    start(client: Client): void {
        if (this.timer) return

        this.client = client
        infoLog({
            message: `Mod digest scheduler started (interval: ${this.tickIntervalMs}ms, period: ${this.periodDays}d)`,
        })

        this.timer = setInterval(() => {
            void this.tick()
        }, this.tickIntervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        this.client = null
    }

    async tick(): Promise<number> {
        if (!this.client) return 0

        const guildIds = await modDigestConfigService.listEnabledGuildIds()
        if (guildIds.length === 0) return 0

        let sent = 0
        for (const guildId of guildIds) {
            try {
                const config = await modDigestConfigService.get(guildId)
                if (!config?.enabled) continue
                if (!this.isDue(config)) continue

                const delivered = await this.sendDigestForGuild(
                    guildId,
                    config.channelId,
                )
                if (delivered) {
                    await modDigestConfigService.markSent(guildId, this.clock())
                    sent += 1
                }
            } catch (error) {
                errorLog({
                    message: 'Mod digest tick failed for guild',
                    error,
                    data: { guildId },
                })
            }
        }
        return sent
    }

    isDue(config: ModDigestConfig): boolean {
        if (config.lastSentAt === null) return true
        const elapsedMs = this.clock() - config.lastSentAt
        return elapsedMs >= this.periodDays * MS_PER_DAY
    }

    async sendDigestForGuild(
        guildId: string,
        channelId: string,
    ): Promise<boolean> {
        if (!this.client) return false

        try {
            const channel = await this.resolveTextChannel(guildId, channelId)
            if (!channel) {
                errorLog({
                    message: 'Mod digest channel unavailable',
                    data: { guildId, channelId },
                })
                return false
            }

            const since = new Date(
                this.clock() - this.periodDays * MS_PER_DAY,
            )
            const [stats, periodCases] = await Promise.all([
                moderationService.getStats(guildId),
                moderationService.getCasesSince(guildId, since),
            ])

            const embed = buildDigestEmbed({
                stats,
                cases: periodCases,
                days: this.periodDays,
            })

            await channel.send({ embeds: [embed] })
            debugLog({
                message: 'Mod digest sent',
                data: { guildId, channelId, days: this.periodDays },
            })
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to send mod digest',
                error,
                data: { guildId, channelId },
            })
            return false
        }
    }

    private async resolveTextChannel(
        guildId: string,
        channelId: string,
    ): Promise<TextChannel | null> {
        if (!this.client) return null

        const guild = this.client.guilds.cache.get(guildId)
        if (!guild) return null

        const channel = await guild.channels.fetch(channelId).catch(() => null)
        if (!channel || channel.type !== ChannelType.GuildText) return null

        return channel as TextChannel
    }
}

export const modDigestSchedulerService = new ModDigestSchedulerService()
