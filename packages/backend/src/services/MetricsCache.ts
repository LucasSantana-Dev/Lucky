import { z } from 'zod'
import type { Guild } from 'discord.js'
import { getClient } from '../utils/discordClientAccessor'
import { debugLog, errorLog } from '@lucky/shared/utils'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const GUILD_METRICS_CACHE_TTL_MS = 30_000

export interface GuildMetrics {
    memberCount: number | null
    categoryCount: number | null
    textChannelCount: number | null
    voiceChannelCount: number | null
    roleCount: number | null
}

interface DiscordGuildChannel {
    id?: string
    name?: string
    type: number
    position?: number
}

const discordGuildChannelSchema = z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.number().int(),
    position: z.number().optional(),
})

export class MetricsCache {
    private guildMetricsCache = new Map<
        string,
        { data: GuildMetrics; expiresAt: number }
    >()

    clearCache(): void {
        this.guildMetricsCache.clear()
    }

    private getCachedMetrics(guildId: string): GuildMetrics | null {
        const cached = this.guildMetricsCache.get(guildId)
        if (!cached) {
            return null
        }

        if (cached.expiresAt <= Date.now()) {
            this.guildMetricsCache.delete(guildId)
            return null
        }

        return cached.data
    }

    private setCachedMetrics(guildId: string, metrics: GuildMetrics): void {
        this.guildMetricsCache.set(guildId, {
            data: metrics,
            expiresAt: Date.now() + GUILD_METRICS_CACHE_TTL_MS,
        })
    }

    private emptyMetrics(): GuildMetrics {
        return {
            memberCount: null,
            categoryCount: null,
            textChannelCount: null,
            voiceChannelCount: null,
            roleCount: null,
        }
    }

    private validateChannelArray(data: unknown): DiscordGuildChannel[] {
        if (!Array.isArray(data)) {
            errorLog({
                message: 'Invalid channels response from Discord API',
                data: { expectedArray: true, receivedType: typeof data },
            })
            return []
        }

        const validated: DiscordGuildChannel[] = []
        for (const item of data) {
            const result = discordGuildChannelSchema.safeParse(item)
            if (result.success) {
                validated.push(result.data)
            } else {
                debugLog({
                    message: 'Skipping invalid channel in Discord API response',
                    data: { errors: result.error.issues },
                })
            }
        }
        return validated
    }

    private countChannelTypes(
        channels: DiscordGuildChannel[],
    ): Pick<
        GuildMetrics,
        'categoryCount' | 'textChannelCount' | 'voiceChannelCount'
    > {
        let categoryCount = 0
        let textChannelCount = 0
        let voiceChannelCount = 0

        for (const channel of channels) {
            if (channel.type === 4) {
                categoryCount += 1
                continue
            }

            if (channel.type === 2 || channel.type === 13) {
                voiceChannelCount += 1
                continue
            }

            if (
                channel.type === 0 ||
                channel.type === 5 ||
                channel.type === 15 ||
                channel.type === 16
            ) {
                textChannelCount += 1
            }
        }

        return {
            categoryCount,
            textChannelCount,
            voiceChannelCount,
        }
    }

    private mergeMetrics(
        primary: GuildMetrics,
        fallback: GuildMetrics,
    ): GuildMetrics {
        return {
            memberCount: primary.memberCount ?? fallback.memberCount,
            categoryCount: primary.categoryCount ?? fallback.categoryCount,
            textChannelCount:
                primary.textChannelCount ?? fallback.textChannelCount,
            voiceChannelCount:
                primary.voiceChannelCount ?? fallback.voiceChannelCount,
            roleCount: primary.roleCount ?? fallback.roleCount,
        }
    }

    private buildMetricsFromClientGuild(guild: Guild): GuildMetrics {
        const channelsCache = guild.channels?.cache
        const channels =
            channelsCache && channelsCache.size > 0
                ? [...channelsCache.values()].map((channel) => ({
                      type: channel.type,
                  }))
                : []
        const hasChannelsSnapshot = channels.length > 0
        const counts = hasChannelsSnapshot
            ? this.countChannelTypes(channels)
            : null
        const roleCache = guild.roles?.cache

        return {
            memberCount: guild.memberCount || null,
            categoryCount: counts?.categoryCount ?? null,
            textChannelCount: counts?.textChannelCount ?? null,
            voiceChannelCount: counts?.voiceChannelCount ?? null,
            roleCount: roleCache ? roleCache.size || null : null,
        }
    }

    private hasUnknownMetrics(metrics: GuildMetrics): boolean {
        return (
            metrics.memberCount === null ||
            metrics.categoryCount === null ||
            metrics.textChannelCount === null ||
            metrics.voiceChannelCount === null ||
            metrics.roleCount === null
        )
    }

    private async resolveClientMetrics(
        guildId: string,
    ): Promise<GuildMetrics | null> {
        const client = getClient()
        if (!client) {
            return null
        }

        const guild = client.guilds.cache.get(guildId)
        if (!guild) {
            return null
        }

        const metricsFromClient = this.buildMetricsFromClientGuild(guild)
        if (!this.hasUnknownMetrics(metricsFromClient)) {
            return metricsFromClient
        }

        const metricsFromApi = await this.fetchGuildMetricsFromApi(guildId)
        return this.mergeMetrics(metricsFromClient, metricsFromApi)
    }

    private getBotToken(): string | null {
        const token = process.env.DISCORD_TOKEN?.trim()
        return token && token.length > 0 ? token : null
    }

    private async fetchGuildMetricsFromApi(
        guildId: string,
    ): Promise<GuildMetrics> {
        const token = this.getBotToken()
        if (!token) {
            return this.emptyMetrics()
        }

        try {
            const headers = {
                Authorization: `Bot ${token}`,
            }

            const [guildResponse, channelsResponse, rolesResponse] =
                await Promise.all([
                    fetch(
                        `${DISCORD_API_BASE_URL}/guilds/${guildId}?with_counts=true`,
                        { headers, signal: AbortSignal.timeout(10_000) },
                    ),
                    fetch(
                        `${DISCORD_API_BASE_URL}/guilds/${guildId}/channels`,
                        {
                            headers,
                            signal: AbortSignal.timeout(10_000),
                        },
                    ),
                    fetch(`${DISCORD_API_BASE_URL}/guilds/${guildId}/roles`, {
                        headers,
                        signal: AbortSignal.timeout(10_000),
                    }),
                ])

            if (!guildResponse.ok) {
                return this.emptyMetrics()
            }

            const guildPayload = (await guildResponse.json()) as {
                approximate_member_count?: number
                member_count?: number
            }

            const counts = channelsResponse.ok
                ? this.countChannelTypes(
                      this.validateChannelArray(await channelsResponse.json()),
                  )
                : {
                      categoryCount: null,
                      textChannelCount: null,
                      voiceChannelCount: null,
                  }

            // Only the array length is used here (not individual role
            // fields), so a shape check is enough — validateRoleArray's full
            // per-item schema would silently drop roles missing optional
            // fields this endpoint never reads, undercounting them.
            const rawRolesPayload = rolesResponse.ok
                ? await rolesResponse.json()
                : []
            const roleCount = Array.isArray(rawRolesPayload)
                ? rawRolesPayload.length
                : null

            return {
                memberCount:
                    guildPayload.approximate_member_count ??
                    guildPayload.member_count ??
                    null,
                categoryCount: counts.categoryCount,
                textChannelCount: counts.textChannelCount,
                voiceChannelCount: counts.voiceChannelCount,
                roleCount: roleCount || null,
            }
        } catch (error) {
            errorLog({
                message: 'Error fetching guild metrics from Discord API',
                error,
            })
            return this.emptyMetrics()
        }
    }

    async getGuildMetrics(guildId: string): Promise<GuildMetrics> {
        const cached = this.getCachedMetrics(guildId)
        if (cached) {
            return cached
        }

        const clientMetrics = await this.resolveClientMetrics(guildId)
        if (clientMetrics) {
            this.setCachedMetrics(guildId, clientMetrics)
            return clientMetrics
        }

        const metrics = await this.fetchGuildMetricsFromApi(guildId)
        this.setCachedMetrics(guildId, metrics)
        return metrics
    }
}

export const metricsService = new MetricsCache()
