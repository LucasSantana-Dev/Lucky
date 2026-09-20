import type { Client } from 'discord.js'
import { discordOAuthService, type DiscordGuild } from './DiscordOAuthService'
import {
    setClient as setDiscordClient,
    getClient as getDiscordClient,
    getBotToken,
} from '../utils/discordClientAccessor'
import {
    roleService,
    type GuildRoleOption,
    type GuildRoleManage,
    type RoleUpsertData,
} from './RoleService'
import {
    guildBotStatusService,
    type GuildWithBotStatus,
} from './GuildBotStatusService'
import { guildChannelService } from './GuildChannelService'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { GuildChannelOption, GuildEmojiOption } from '@lucky/shared/types'
import { isSnowflakeId } from '../schemas/common'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'

export interface GuildMemberContext {
    nickname: string | null
    roleIds: string[]
}

// Re-exported for backward compatibility with existing consumers.
export type { GuildChannelOption, GuildEmojiOption } from '@lucky/shared/types'
export type { GuildWithBotStatus } from './GuildBotStatusService'

// Re-export role interfaces from RoleService for backward compatibility
export type {
    GuildRoleOption,
    GuildRoleManage,
    RoleUpsertData,
} from './RoleService'

export function setBotClient(client: Client | null): void {
    setDiscordClient(client)
    guildBotStatusService.clearBotGuildCache()
}

class GuildService {
    private getBotClient(): Client | null {
        return getDiscordClient()
    }

    async hasBotInGuild(guildId: string): Promise<boolean> {
        return guildBotStatusService.hasBotInGuild(guildId)
    }

    async getGuildMemberContext(
        guildId: string,
        userId: string,
    ): Promise<GuildMemberContext> {
        const fallback: GuildMemberContext = { nickname: null, roleIds: [] }

        if (!isSnowflakeId(guildId)) {
            return fallback
        }

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

        const token = getBotToken()
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
        return guildChannelService.getGuildTextChannelOptions(guildId)
    }

    async getGuildEmojis(guildId: string): Promise<GuildEmojiOption[]> {
        return guildChannelService.getGuildEmojis(guildId)
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
        return guildBotStatusService.checkBotInGuild(guildId)
    }

    generateBotInviteUrl(guildId?: string): string {
        return guildBotStatusService.generateBotInviteUrl(guildId)
    }

    async enrichGuildsWithBotStatus(
        guilds: DiscordGuild[],
    ): Promise<GuildWithBotStatus[]> {
        return guildBotStatusService.enrichGuildsWithBotStatus(guilds)
    }

    async getGuildDetails(guildId: string): Promise<GuildWithBotStatus | null> {
        return guildBotStatusService.getGuildDetails(guildId)
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
        return guildBotStatusService.getAllBotGuilds()
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
