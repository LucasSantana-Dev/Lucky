import { z } from 'zod'
import type { Client } from 'discord.js'
import { discordOAuthService, type DiscordGuild } from './DiscordOAuthService'
import {
    setClient as setDiscordClient,
    getClient as getDiscordClient,
    getServableGuild,
} from '../utils/discordClientAccessor'
import { metricsService } from './MetricsCache'
import {
    roleService,
    type GuildRoleOption,
    type GuildRoleManage,
    type RoleUpsertData,
} from './RoleService'
import { debugLog, errorLog } from '@lucky/shared/utils'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const BOT_GUILD_CACHE_TTL_MS = 60_000
// Discord permission bitfield literal representing zero permissions granted
const NO_PERMISSIONS = '0'

export interface GuildMemberContext {
    nickname: string | null
    roleIds: string[]
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

// Re-export role interfaces from RoleService for backward compatibility
export type {
    GuildRoleOption,
    GuildRoleManage,
    RoleUpsertData,
} from './RoleService'

export function setBotClient(client: Client | null): void {
    setDiscordClient(client)
    guildService.clearBotGuildCache()
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

    private botGuildIdsInFlight: Promise<Set<string> | null> | null = null

    private getBotClient(): Client | null {
        return getDiscordClient()
    }

    clearBotGuildCache(): void {
        this.botGuildIdsCache = null
        this.botGuildIdsInFlight = null
        metricsService.clearCache()
    }

    private getBotToken(): string | null {
        const token = process.env.DISCORD_TOKEN?.trim()
        return token && token.length > 0 ? token : null
    }

    private validateChannelArray(data: unknown): Array<{
        id?: string
        name?: string
        type: number
        position?: number
    }> {
        if (!Array.isArray(data)) {
            errorLog({
                message: 'Invalid channels response from Discord API',
                data: { expectedArray: true, receivedType: typeof data },
            })
            return []
        }

        const channelSchema = z.object({
            id: z.string().optional(),
            name: z.string().optional(),
            type: z.number().int(),
            position: z.number().optional(),
        })

        const validated: Array<{
            id?: string
            name?: string
            type: number
            position?: number
        }> = []
        for (const item of data) {
            const result = channelSchema.safeParse(item)
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

    async hasBotInGuild(guildId: string): Promise<boolean> {
        const botGuildIds = await this.getBotGuildIds()
        return (
            this.checkBotInGuild(guildId) ||
            (botGuildIds?.has(guildId) ?? false)
        )
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
        return roleService.getGuildRoleOptions(guildId)
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

            const payload = this.validateChannelArray(await response.json())

            const filteredChannels = payload.filter(
                (
                    channel,
                ): channel is {
                    id: string
                    name: string
                    type: number
                    position?: number
                } =>
                    typeof channel.id === 'string' &&
                    typeof channel.name === 'string' &&
                    (channel.type === 0 ||
                        channel.type === 5 ||
                        channel.type === 15 ||
                        channel.type === 16),
            )

            return filteredChannels
                .sort(
                    (
                        a: {
                            id: string
                            name: string
                            type: number
                            position?: number
                        },
                        b: {
                            id: string
                            name: string
                            type: number
                            position?: number
                        },
                    ) => (a.position ?? 0) - (b.position ?? 0),
                )
                .map(
                    (channel: {
                        id: string
                        name: string
                        type: number
                        position?: number
                    }) => ({
                        id: channel.id,
                        name: `#${channel.name}`,
                    }),
                )
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
                const guild = await getServableGuild(guildId)
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
                    ? await metricsService.getGuildMetrics(guild.id)
                    : {
                          memberCount: null,
                          categoryCount: null,
                          textChannelCount: null,
                          voiceChannelCount: null,
                          roleCount: null,
                      }

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
        const metrics = await metricsService.getGuildMetrics(guildId)

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
                const metrics = await metricsService.getGuildMetrics(guild.id)
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
        return roleService.getFullGuildRoles(guildId)
    }

    async createGuildRole(
        guildId: string,
        data: RoleUpsertData,
    ): Promise<GuildRoleManage> {
        return roleService.createGuildRole(guildId, data)
    }

    async updateGuildRole(
        guildId: string,
        roleId: string,
        data: RoleUpsertData,
    ): Promise<GuildRoleManage> {
        return roleService.updateGuildRole(guildId, roleId, data)
    }

    async deleteGuildRole(guildId: string, roleId: string): Promise<void> {
        return roleService.deleteGuildRole(guildId, roleId)
    }
}

export const guildService = new GuildService()
