import type { Client } from 'discord.js'
import { discordOAuthService, type DiscordGuild } from './DiscordOAuthService'
import { debugLog, errorLog } from '@lucky/shared/utils'

let botClient: Client | null = null
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const BOT_GUILD_CACHE_TTL_MS = 60_000

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
}

class GuildService {
    private botGuildIdsCache: {
        guildIds: Set<string>
        expiresAt: number
    } | null = null

    private botGuildIdsInFlight: Promise<Set<string> | null> | null = null

    private getBotClient(): Client | null {
        return getClient()
    }

    clearBotGuildCache(): void {
        this.botGuildIdsCache = null
        this.botGuildIdsInFlight = null
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

        return guilds.map((guild) => {
            const hasBot =
                this.checkBotInGuild(guild.id) ||
                (botGuildIds?.has(guild.id) ?? false)
            const botInviteUrl = hasBot
                ? undefined
                : this.generateBotInviteUrl(guild.id)

            return {
                ...guild,
                hasBot,
                botInviteUrl,
            }
        })
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

        return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            owner: false,
            permissions: '0',
            features: guild.features,
            hasBot,
            botInviteUrl,
        }
    }
}

export const guildService = new GuildService()
