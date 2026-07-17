import { z } from 'zod'
import { getClient, getServableGuild } from '../utils/discordClientAccessor'
import { debugLog, errorLog } from '@lucky/shared/utils'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
// Discord permission bitfield literal representing zero permissions granted
const NO_PERMISSIONS = '0'

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

// Zod validation schemas for Discord API responses
const discordGuildRoleSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
    color: z.number().optional(),
    position: z.number().optional(),
    hoist: z.boolean().optional(),
    mentionable: z.boolean().optional(),
    permissions: z.string().optional(),
    managed: z.boolean().optional(),
})

class RoleService {
    private getBotToken(): string | null {
        const token = process.env.DISCORD_TOKEN?.trim()
        return token && token.length > 0 ? token : null
    }

    private validateRoleArray(data: unknown): DiscordGuildRole[] {
        if (!Array.isArray(data)) {
            errorLog({
                message: 'Invalid roles response from Discord API',
                data: { expectedArray: true, receivedType: typeof data },
            })
            return []
        }

        const validated: DiscordGuildRole[] = []
        for (const item of data) {
            const result = discordGuildRoleSchema.safeParse(item)
            if (result.success) {
                validated.push(result.data)
            } else {
                debugLog({
                    message: 'Skipping invalid role in Discord API response',
                    data: { errors: result.error.issues },
                })
            }
        }
        return validated
    }

    private validateSingleRole(data: unknown): DiscordGuildRole | null {
        const result = discordGuildRoleSchema.safeParse(data)
        if (!result.success) {
            errorLog({
                message: 'Invalid role response from Discord API',
                data: { errors: result.error.issues },
            })
            return null
        }
        return result.data
    }

    async getGuildRoleOptions(guildId: string): Promise<GuildRoleOption[]> {
        const client = getClient()

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

            const payload = this.validateRoleArray(await response.json())

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

    async getFullGuildRoles(guildId: string): Promise<GuildRoleManage[]> {
        const client = getClient()

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

            const payload = this.validateRoleArray(await response.json())

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
        const guild = await getServableGuild(guildId)

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

            const payload = this.validateSingleRole(await response.json())
            if (!payload) {
                throw new Error(
                    'Discord API error: Failed to validate role response from Discord API',
                )
            }
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
        const guild = await getServableGuild(guildId)

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

            const payload = this.validateSingleRole(await response.json())
            if (!payload) {
                throw new Error(
                    'Discord API error: Failed to validate role response from Discord API',
                )
            }
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
        const guild = await getServableGuild(guildId)

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

export const roleService = new RoleService()
