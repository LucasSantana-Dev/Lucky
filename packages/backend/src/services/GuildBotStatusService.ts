import type { Client } from 'discord.js'
import { BOT_INVITE_PERMISSIONS } from '@lucky/shared/constants'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { DiscordGuild } from './DiscordOAuthService'
import { getClient as getDiscordClient } from '../utils/discordClientAccessor'
import { metricsService } from './MetricsCache'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const BOT_GUILD_CACHE_TTL_MS = 60_000
// Discord permission bitfield literal representing zero permissions granted
const NO_PERMISSIONS = '0'

export interface GuildWithBotStatus extends DiscordGuild {
    hasBot: boolean
    botInviteUrl?: string
    memberCount: number | null
    categoryCount: number | null
    textChannelCount: number | null
    voiceChannelCount: number | null
    roleCount: number | null
}

class GuildBotStatusService {
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
        // Was a hardcoded '8' — Administrator. The dashboard's "add Lucky to
        // this server" flow asked every owner for full admin, contradicting
        // both the ADR and the public listings (#1923). Shares the curated set
        // with the landing page and the /invite redirect.
        const permissions = BOT_INVITE_PERMISSIONS
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
}

export const guildBotStatusService = new GuildBotStatusService()
