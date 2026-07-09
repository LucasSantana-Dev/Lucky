import type { Client, Guild } from 'discord.js'
import { discordOAuthService, type DiscordGuild } from './DiscordOAuthService'
import { debugLog, errorLog } from '@lucky/shared/utils'

let botClient: Client | null = null
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const BOT_GUILD_CACHE_TTL_MS = 60_000
const GUILD_METRICS_CACHE_TTL_MS = 30_000
// Discord permission bitfield literal representing zero permissions granted
const NO_PERMISSIONS = '0'

interface GuildMetrics {
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

interface DiscordGuildRole {
    id: string
    name: string
    color?: number
    position?: number
    hoist?: boolean
    mentionable?: boolean
    permissions?: string
    managed?: boolean
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

export interface GuildRoleManage {
    id: string
    name: string
    color: number
    hoist: boolean
    mentionable: boolean
    permissions: string
    position: number
    managed: boolean
}

export interface RoleUpsertData {
    name: string
    color?: number
    hoist?: boolean
    mentionable?: boolean
    permissions?: string
}

export interface GuildChannelOption {
    id: string
    name: string
}

export interface GuildEmojiOption {
    id: string
    name: string
    animated: boolean
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

    private async getServableGuild(guildId: string): Promise<Guild | null> {
        const client = this.getBotClient()
        if (!client) return null
        try {
            return (
                client.guilds.cache.get(guildId) ??
                (await client.guilds.fetch(guildId))
            )
        } catch {
            return null
        }
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
                    signal: AbortSignal.timeout(10_000),
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

            const channelsPayload = channelsResponse.ok
                ? ((await channelsResponse.json()) as DiscordGuildChannel[])
                : []

            const rolesPayload = rolesResponse.ok
                ? ((await rolesResponse.json()) as DiscordGuildRole[])
                : []

            const counts = this.countChannelTypes(channelsPayload)

            return {
                memberCount:
                    guildPayload.approximate_member_count ??
                    guildPayload.member_count ??
                    null,
                categoryCount: counts.categoryCount,
                textChannelCount: counts.textChannelCount,
                voiceChannelCount: counts.voiceChannelCount,
                roleCount: rolesPayload.length || null,
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
                    signal: AbortSignal.timeout(10_000),
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
                    signal: AbortSignal.timeout(10_000),
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

    async getGuildTextChannelOptions(
        guildId: string,
    ): Promise<GuildChannelOption[]> {
        const client = this.getBotClient()

        if (client) {
            try {
                const guild =
                    client.guilds.cache.get(guildId) ??
                    (await client.guilds.fetch(guildId))
                const channels = await guild.channels.fetch()
                return [...channels.values()]
                    .filter(
                        (channel): channel is NonNullable<typeof channel> =>
                            channel !== null &&
                            (channel.type === 0 ||
                                channel.type === 5 ||
                                channel.type === 15 ||
                                channel.type === 16),
                    )
                    .sort((a, b) => a.rawPosition - b.rawPosition)
                    .map((channel) => ({
                        id: channel.id,
                        name: `#${channel.name}`,
                    }))
            } catch (error) {
                debugLog({
                    message: 'Failed to fetch guild channels from bot client',
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
                `${DISCORD_API_BASE_URL}/guilds/${guildId}/channels`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                return []
            }

            const payload = (await response.json()) as DiscordGuildChannel[]

            return payload
                .filter(
                    (channel) =>
                        typeof channel.id === 'string' &&
                        typeof channel.name === 'string' &&
                        (channel.type === 0 ||
                            channel.type === 5 ||
                            channel.type === 15 ||
                            channel.type === 16),
                )
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map((channel) => ({
                    id: channel.id as string,
                    name: `#${channel.name as string}`,
                }))
        } catch (error) {
            errorLog({
                message: 'Failed to fetch guild channels',
                error,
            })
            return []
        }
    }

    async getGuildEmojis(guildId: string): Promise<GuildEmojiOption[]> {
        const client = this.getBotClient()

        if (client) {
            try {
                const guild = await this.getServableGuild(guildId)
                if (guild) {
                    return [...guild.emojis.cache.values()].map((emoji) => ({
                        id: emoji.id,
                        name: emoji.name ?? '',
                        animated: emoji.animated ?? false,
                    }))
                }
            } catch (error) {
                debugLog({
                    message: 'Failed to fetch guild emojis from bot client',
                    error,
                })
            }
        }

        const token = this.getBotToken()
        if (!token) {
            return []
        }

        // Reject anything that is not a Discord snowflake before it reaches the
        // request URL — validated inline at the sink so the ID cannot forge the
        // request (SSRF / path-traversal guard).
        if (!/^\d{17,20}$/.test(guildId)) {
            throw new Error('Invalid Discord guild id')
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${guildId}/emojis`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                throw new Error(`Discord API error: ${response.status}`)
            }

            const payload = (await response.json()) as unknown[]

            return payload
                .filter(
                    (
                        emoji,
                    ): emoji is {
                        id: string
                        name?: string
                        animated?: boolean
                    } =>
                        typeof emoji === 'object' &&
                        emoji !== null &&
                        typeof (emoji as { id?: unknown }).id === 'string',
                )
                .map((emoji) => ({
                    id: emoji.id,
                    name: emoji.name ?? '',
                    animated: emoji.animated ?? false,
                }))
        } catch (error) {
            errorLog({
                message: 'Failed to fetch guild emojis',
                error,
            })
            throw error
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
            permissions: NO_PERMISSIONS,
            features: guild.features,
            hasBot,
            botInviteUrl,
            ...metrics,
        }
    }

    async getAllBotGuilds(): Promise<
        Array<{
            id: string
            name: string
            iconUrl: string | null
            memberCount: number | null
            textChannelCount: number | null
            voiceChannelCount: number | null
            roleCount: number | null
        }>
    > {
        const client = this.getBotClient()
        if (!client) {
            return []
        }

        const guilds = [...client.guilds.cache.values()]

        return Promise.all(
            guilds.map(async (guild) => {
                const metrics = await this.getGuildMetrics(guild.id)
                const iconUrl = guild.icon
                    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
                    : null

                return {
                    id: guild.id,
                    name: guild.name,
                    iconUrl,
                    memberCount: metrics.memberCount,
                    textChannelCount: metrics.textChannelCount,
                    voiceChannelCount: metrics.voiceChannelCount,
                    roleCount: metrics.roleCount,
                }
            }),
        )
    }

    async getFullGuildRoles(guildId: string): Promise<GuildRoleManage[]> {
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
                        hoist: role.hoist ?? false,
                        mentionable: role.mentionable ?? false,
                        permissions: role.permissions.bitfield.toString(),
                        position: role.position ?? 0,
                        managed: role.managed ?? false,
                    }))
                    .sort((a, b) => b.position - a.position)
            } catch (error) {
                debugLog({
                    message: 'Failed to fetch full guild roles from bot client',
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
                `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                return []
            }

            const payload = (await response.json()) as DiscordGuildRole[]

            return payload
                .filter((role) => role.id !== guildId)
                .map((role) => ({
                    id: role.id,
                    name: role.name,
                    color: role.color ?? 0,
                    hoist: role.hoist ?? false,
                    mentionable: role.mentionable ?? false,
                    permissions: role.permissions ?? NO_PERMISSIONS,
                    position: role.position ?? 0,
                    managed: role.managed ?? false,
                }))
                .sort((a, b) => b.position - a.position)
        } catch (error) {
            errorLog({
                message: 'Failed to fetch full guild roles',
                error,
            })
            return []
        }
    }

    // eslint-disable-next-line complexity
    async createGuildRole(
        guildId: string,
        data: RoleUpsertData,
    ): Promise<GuildRoleManage> {
        const guild = await this.getServableGuild(guildId)

        if (guild) {
            const role = await guild.roles.create({
                name: data.name,
                color: data.color,
                hoist: data.hoist,
                mentionable: data.mentionable,
                permissions:
                    data.permissions !== undefined
                        ? BigInt(data.permissions)
                        : undefined,
                reason: 'Created via dashboard',
            })
            return {
                id: role.id,
                name: role.name,
                color: role.color ?? 0,
                hoist: role.hoist ?? false,
                mentionable: role.mentionable ?? false,
                permissions: role.permissions.bitfield.toString(),
                position: role.position ?? 0,
                managed: role.managed ?? false,
            }
        }

        const token = this.getBotToken()
        if (!token) {
            throw new Error('No bot token available')
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bot ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: data.name,
                        color: data.color,
                        hoist: data.hoist,
                        mentionable: data.mentionable,
                        permissions: data.permissions,
                    }),
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Discord API error: ${error}`)
            }

            const payload = (await response.json()) as DiscordGuildRole
            return {
                id: payload.id,
                name: payload.name,
                color: payload.color ?? 0,
                hoist: payload.hoist ?? false,
                mentionable: payload.mentionable ?? false,
                permissions: payload.permissions ?? NO_PERMISSIONS,
                position: payload.position ?? 0,
                managed: payload.managed ?? false,
            }
        } catch (error) {
            errorLog({
                message: 'Failed to create guild role via API',
                error,
            })
            throw error
        }
    }

    // eslint-disable-next-line complexity
    async updateGuildRole(
        guildId: string,
        roleId: string,
        data: RoleUpsertData,
    ): Promise<GuildRoleManage> {
        const guild = await this.getServableGuild(guildId)

        if (guild) {
            const role = await guild.roles.fetch(roleId)
            if (!role) {
                throw new Error('Role not found')
            }
            const updated = await role.edit({
                name: data.name,
                color: data.color,
                hoist: data.hoist,
                mentionable: data.mentionable,
                permissions:
                    data.permissions !== undefined
                        ? BigInt(data.permissions)
                        : undefined,
                reason: 'Updated via dashboard',
            })
            return {
                id: updated.id,
                name: updated.name,
                color: updated.color ?? 0,
                hoist: updated.hoist ?? false,
                mentionable: updated.mentionable ?? false,
                permissions: updated.permissions.bitfield.toString(),
                position: updated.position ?? 0,
                managed: updated.managed ?? false,
            }
        }

        const token = this.getBotToken()
        if (!token) {
            throw new Error('No bot token available')
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bot ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: data.name,
                        color: data.color,
                        hoist: data.hoist,
                        mentionable: data.mentionable,
                        permissions: data.permissions,
                    }),
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Discord API error: ${error}`)
            }

            const payload = (await response.json()) as DiscordGuildRole
            return {
                id: payload.id,
                name: payload.name,
                color: payload.color ?? 0,
                hoist: payload.hoist ?? false,
                mentionable: payload.mentionable ?? false,
                permissions: payload.permissions ?? NO_PERMISSIONS,
                position: payload.position ?? 0,
                managed: payload.managed ?? false,
            }
        } catch (error) {
            errorLog({
                message: 'Failed to update guild role via API',
                error,
            })
            throw error
        }
    }

    async deleteGuildRole(guildId: string, roleId: string): Promise<void> {
        const guild = await this.getServableGuild(guildId)

        if (guild) {
            const role = await guild.roles.fetch(roleId)
            if (!role) {
                throw new Error('Role not found')
            }
            await role.delete('Deleted via dashboard')
            return
        }

        const token = this.getBotToken()
        if (!token) {
            throw new Error('No bot token available')
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Discord API error: ${error}`)
            }
        } catch (error) {
            errorLog({
                message: 'Failed to delete guild role via API',
                error,
            })
            throw error
        }
    }
}

export const guildService = new GuildService()
