import type { Client, Guild } from 'discord.js'
import { discordOAuthService, type DiscordGuild } from './DiscordOAuthService'
import { debugLog, errorLog } from '@lucky/shared/utils'

let botClient: Client | null = null
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const BOT_GUILD_CACHE_TTL_MS = 60_000
const GUILD_METRICS_CACHE_TTL_MS = 30_000

interface GuildMetrics {
    memberCount: number | null
    categoryCount: number | null
    textChannelCount: number | null
    voiceChannelCount: number | null
    roleCount: number | null
}

interface DiscordGuildChannel {
    type: number
}

interface DiscordGuildRole {
    id: string
    name: string
    color?: number
    position?: number
}

export interface GuildMemberContext {
    nickname: string | null
    roleIds: string[]
}

export interface GuildRoleOption {
    id: string
    name: string
    color: number
    position: number
}

export function setBotClient(client: Client | null): void {
    botClient = client
    guildService.clearBotGuildCache()
}

function getClient(): Client | null {
    return botClient
}

export interface GuildWithBotStatus extends DiscordGuild {
    hasBot: boolean
    botInviteUrl?: string
    memberCount: number | null
    categoryCount: number | null
    textChannelCount: number | null
    voiceChannelCount: number | null
    roleCount: number | null
}

class GuildService {
    private botGuildIdsCache: {
        guildIds: Set<string>
        expiresAt: number
    } | null = null

    private guildMetricsCache = new Map<
        string,
        { data: GuildMetrics; expiresAt: number }
    >()

    private botGuildIdsInFlight: Promise<Set<string> | null> | null = null

    private getBotClient(): Client | null {
        return getClient()
    }

    clearBotGuildCache(): void {
        this.botGuildIdsCache = null
        this.botGuildIdsInFlight = null
        this.guildMetricsCache.clear()
    }

    private getBotToken(): string | null {
        const token = process.env.DISCORD_TOKEN?.trim()
        return token && token.length > 0 ? token : null
    }

    private async fetchBotGuildIds(token: string): Promise<Set<string> | null> {
        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/users/@me/guilds`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                },
            )

            if (!response.ok) {
                const responseBody = await response.text()
                errorLog({
                    message: 'Failed to fetch bot guilds from Discord API',
                    data: {
                        status: response.status,
                        responseBody,
                    },
                })
                return null
            }

            const payload = (await response.json()) as unknown
            if (!Array.isArray(payload)) {
                errorLog({
                    message: 'Invalid bot guild payload from Discord API',
                })
                return null
            }

            const guildIds = new Set<string>()
            for (const item of payload) {
                if (
                    typeof item === 'object' &&
                    item !== null &&
                    typeof (item as { id?: unknown }).id === 'string'
                ) {
                    guildIds.add((item as { id: string }).id)
                }
            }

            this.botGuildIdsCache = {
                guildIds,
                expiresAt: Date.now() + BOT_GUILD_CACHE_TTL_MS,
            }

            debugLog({
                message: 'Fetched bot guild ids from Discord API',
                data: { guildCount: guildIds.size },
            })

            return guildIds
        } catch (error) {
            errorLog({
                message: 'Error fetching bot guild ids from Discord API',
                error,
            })
            return null
        }
    }

    private async getBotGuildIds(): Promise<Set<string> | null> {
        const token = this.getBotToken()
        if (!token) {
            this.clearBotGuildCache()
            return null
        }

        const now = Date.now()
        if (this.botGuildIdsCache && this.botGuildIdsCache.expiresAt > now) {
            return this.botGuildIdsCache.guildIds
        }

        if (this.botGuildIdsInFlight) {
            return this.botGuildIdsInFlight
        }

        this.botGuildIdsInFlight = this.fetchBotGuildIds(token).finally(() => {
            this.botGuildIdsInFlight = null
        })

        return this.botGuildIdsInFlight
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
        const client = this.getBotClient()
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
                        { headers },
                    ),
                    fetch(
                        `${DISCORD_API_BASE_URL}/guilds/${guildId}/channels`,
                        {
                            headers,
                        },
                    ),
                    fetch(`${DISCORD_API_BASE_URL}/guilds/${guildId}/roles`, {
                        headers,
                    }),
                ])

            if (!guildResponse.ok) {
                return this.emptyMetrics()
            }

            const guildPayload = (await guildResponse.json()) as {
                approximate_member_count?: number
                member_count?: number
            }

            const channelsPayload = channelsResponse.ok
                ? ((await channelsResponse.json()) as unknown)
                : null
            const channels = Array.isArray(channelsPayload)
                ? (channelsPayload as DiscordGuildChannel[])
                : null
            const counts = channels ? this.countChannelTypes(channels) : null

            const rolesPayload = rolesResponse.ok
                ? ((await rolesResponse.json()) as unknown)
                : null
            const roles = Array.isArray(rolesPayload)
                ? (rolesPayload as DiscordGuildRole[])
                : null

            return {
                memberCount:
                    guildPayload.approximate_member_count ??
                    guildPayload.member_count ??
                    null,
                categoryCount: counts?.categoryCount ?? null,
                textChannelCount: counts?.textChannelCount ?? null,
                voiceChannelCount: counts?.voiceChannelCount ?? null,
                roleCount: roles ? roles.length : null,
            }
        } catch (error) {
            errorLog({
                message: 'Error fetching guild metrics from Discord API',
                error,
            })
            return this.emptyMetrics()
        }
    }

    async hasBotInGuild(guildId: string): Promise<boolean> {
        const botGuildIds = await this.getBotGuildIds()
        return (
            this.checkBotInGuild(guildId) ||
            (botGuildIds?.has(guildId) ?? false)
        )
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

    async getGuildMemberContext(
        guildId: string,
        userId: string,
    ): Promise<GuildMemberContext> {
        const fallback: GuildMemberContext = { nickname: null, roleIds: [] }
        const client = this.getBotClient()

        if (client) {
            try {
                const guild =
                    client.guilds.cache.get(guildId) ??
                    (await client.guilds.fetch(guildId))
                const member = await guild.members.fetch(userId)
                const roleIds = [...member.roles.cache.keys()].filter(
                    (roleId) => roleId !== guild.id,
                )
                return {
                    nickname: member.nickname ?? null,
                    roleIds,
                }
            } catch (error) {
                debugLog({
                    message: 'Failed to fetch member context from bot client',
                    error,
                })
            }
        }

        const token = this.getBotToken()
        if (!token) {
            return fallback
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${guildId}/members/${userId}`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                },
            )

            if (!response.ok) {
                return fallback
            }

            const payload = (await response.json()) as {
                nick?: string | null
                roles?: string[]
            }

            return {
                nickname: payload.nick ?? null,
                roleIds: payload.roles ?? [],
            }
        } catch (error) {
            errorLog({
                message: 'Failed to fetch guild member context',
                error,
            })
            return fallback
        }
    }

    async getGuildRoleOptions(guildId: string): Promise<GuildRoleOption[]> {
        const client = this.getBotClient()

        if (client) {
            try {
                const guild =
                    client.guilds.cache.get(guildId) ??
                    (await client.guilds.fetch(guildId))
                const roles = await guild.roles.fetch()
                return [...roles.values()]
                    .filter((role) => role.id !== guild.id)
                    .map((role) => ({
                        id: role.id,
                        name: role.name,
                        color: role.color ?? 0,
                        position: role.position ?? 0,
                    }))
                    .sort((a, b) => b.position - a.position)
            } catch (error) {
                debugLog({
                    message: 'Failed to fetch guild roles from bot client',
                    error,
                })
            }
        }

        const token = this.getBotToken()
        if (!token) {
            return []
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${guildId}/roles`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                },
            )

            if (!response.ok) {
                return []
            }

            const payload = (await response.json()) as DiscordGuildRole[]

            return payload
                .map((role) => ({
                    id: role.id,
                    name: role.name,
                    color: role.color ?? 0,
                    position: role.position ?? 0,
                }))
                .sort((a, b) => b.position - a.position)
        } catch (error) {
            errorLog({
                message: 'Failed to fetch guild roles',
                error,
            })
            return []
        }
    }

    async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
        try {
            const allGuilds =
                await discordOAuthService.getUserGuilds(accessToken)
            const adminGuilds = discordOAuthService.filterAdminGuilds(allGuilds)
            debugLog({
                message: 'Fetched user guilds',
                data: { total: allGuilds.length, admin: adminGuilds.length },
            })
            return adminGuilds
        } catch (error) {
            errorLog({ message: 'Error fetching user guilds:', error })
            throw error
        }
    }

    checkBotInGuild(guildId: string): boolean {
        const client = this.getBotClient()
        if (!client) {
            return false
        }

        const guild = client.guilds.cache.get(guildId)
        return guild !== undefined
    }

    generateBotInviteUrl(guildId?: string): string {
        const clientId = process.env.CLIENT_ID
        if (!clientId) {
            throw new Error('CLIENT_ID not configured')
        }

        const scopes = ['bot', 'applications.commands']
        const permissions = '8'
        const redirectUri = process.env.WEBAPP_REDIRECT_URI

        let inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scopes.join('%20')}`

        if (guildId) {
            inviteUrl += `&guild_id=${guildId}`
        }

        if (redirectUri) {
            inviteUrl += `&redirect_uri=${encodeURIComponent(redirectUri)}`
        }

        return inviteUrl
    }

    async enrichGuildsWithBotStatus(
        guilds: DiscordGuild[],
    ): Promise<GuildWithBotStatus[]> {
        const botGuildIds = await this.getBotGuildIds()
        const enrichedGuilds = await Promise.all(
            guilds.map(async (guild) => {
                const hasBot =
                    this.checkBotInGuild(guild.id) ||
                    (botGuildIds?.has(guild.id) ?? false)
                const botInviteUrl = hasBot
                    ? undefined
                    : this.generateBotInviteUrl(guild.id)
                const metrics = hasBot
                    ? await this.getGuildMetrics(guild.id)
                    : this.emptyMetrics()

                return {
                    ...guild,
                    hasBot,
                    botInviteUrl,
                    ...metrics,
                }
            }),
        )

        return enrichedGuilds
    }

    async getGuildDetails(guildId: string): Promise<GuildWithBotStatus | null> {
        const client = this.getBotClient()
        if (!client) {
            return null
        }

        const guild = client.guilds.cache.get(guildId)
        if (!guild) {
            return null
        }

        const hasBot = true
        const botInviteUrl = this.generateBotInviteUrl(guildId)
        const metrics = await this.getGuildMetrics(guildId)

        return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            owner: false,
            permissions: '0',
            features: guild.features,
            hasBot,
            botInviteUrl,
            ...metrics,
        }
    }
}

export const guildService = new GuildService()
