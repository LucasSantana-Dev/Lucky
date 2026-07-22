import { z } from 'zod'
import type { Guild, Role } from 'discord.js'
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

    private mapClientRoleToOption(role: Role): GuildRoleOption {
        return {
            id: role.id,
            name: role.name,
            color: role.color ?? 0,
            position: role.position ?? 0,
        }
    }

    private mapApiRoleToOption(role: DiscordGuildRole): GuildRoleOption {
        return {
            id: role.id,
            name: role.name,
            color: role.color ?? 0,
            position: role.position ?? 0,
        }
    }

    private mapClientRoleToManage(role: Role): GuildRoleManage {
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

    private mapApiRoleToManage(role: DiscordGuildRole): GuildRoleManage {
        return {
            id: role.id,
            name: role.name,
            color: role.color ?? 0,
            hoist: role.hoist ?? false,
            mentionable: role.mentionable ?? false,
            permissions: role.permissions ?? NO_PERMISSIONS,
            position: role.position ?? 0,
            managed: role.managed ?? false,
        }
    }

    private parseManageRolePayload(data: unknown): GuildRoleManage {
        const payload = this.validateSingleRole(data)
        if (!payload) {
            throw new Error(
                'Discord API error: Failed to validate role response from Discord API',
            )
        }
        return this.mapApiRoleToManage(payload)
    }

    private buildClientRoleData(data: RoleUpsertData): {
        name: string
        color?: number
        hoist?: boolean
        mentionable?: boolean
        permissions?: bigint
    } {
        return {
            name: data.name,
            color: data.color,
            hoist: data.hoist,
            mentionable: data.mentionable,
            permissions:
                data.permissions !== undefined
                    ? BigInt(data.permissions)
                    : undefined,
        }
    }

    private buildRoleWriteBody(data: RoleUpsertData): RoleUpsertData {
        return {
            name: data.name,
            color: data.color,
            hoist: data.hoist,
            mentionable: data.mentionable,
            permissions: data.permissions,
        }
    }

    // Returns null when there is no bot client or the client fetch fails,
    // signaling callers to fall back to the REST API.
    private async fetchClientGuildRoles(
        guildId: string,
        errorMessage: string,
    ): Promise<Role[] | null> {
        const client = getClient()
        if (!client) {
            return null
        }

        try {
            const guild =
                client.guilds.cache.get(guildId) ??
                (await client.guilds.fetch(guildId))
            const roles = await guild.roles.fetch()
            return [...roles.values()].filter((role) => role.id !== guild.id)
        } catch (error) {
            debugLog({
                message: errorMessage,
                error,
            })
            return null
        }
    }

    private async fetchApiGuildRoles(
        url: string,
        errorMessage: string,
    ): Promise<DiscordGuildRole[]> {
        const token = this.getBotToken()
        if (!token) {
            return []
        }

        try {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bot ${token}`,
                },
                signal: AbortSignal.timeout(10_000),
            })

            if (!response.ok) {
                return []
            }

            return this.validateRoleArray(await response.json())
        } catch (error) {
            errorLog({
                message: errorMessage,
                error,
            })
            return []
        }
    }

    private async fetchClientRole(guild: Guild, roleId: string): Promise<Role> {
        const role = await guild.roles.fetch(roleId)
        if (!role) {
            throw new Error('Role not found')
        }
        return role
    }

    private async discordRoleWriteRequest(
        url: string,
        options: { method: 'POST' | 'PATCH'; body: RoleUpsertData },
        errorMessage: string,
    ): Promise<GuildRoleManage>
    private async discordRoleWriteRequest(
        url: string,
        options: { method: 'DELETE' },
        errorMessage: string,
    ): Promise<undefined>
    private async discordRoleWriteRequest(
        url: string,
        options:
            | { method: 'POST' | 'PATCH'; body: RoleUpsertData }
            | { method: 'DELETE' },
        errorMessage: string,
    ): Promise<GuildRoleManage | undefined> {
        const token = this.getBotToken()
        if (!token) {
            throw new Error('No bot token available')
        }

        try {
            const body =
                'body' in options
                    ? JSON.stringify(this.buildRoleWriteBody(options.body))
                    : undefined
            const response = await fetch(url, {
                method: options.method,
                headers: {
                    Authorization: `Bot ${token}`,
                    ...(body !== undefined
                        ? { 'Content-Type': 'application/json' }
                        : {}),
                },
                ...(body !== undefined ? { body } : {}),
                signal: AbortSignal.timeout(10_000),
            })

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Discord API error: ${error}`)
            }

            if (body === undefined) {
                return undefined
            }
            return this.parseManageRolePayload(await response.json())
        } catch (error) {
            errorLog({
                message: errorMessage,
                error,
            })
            throw error
        }
    }

    async getGuildRoleOptions(guildId: string): Promise<GuildRoleOption[]> {
        const clientRoles = await this.fetchClientGuildRoles(
            guildId,
            'Failed to fetch guild roles from bot client',
        )
        if (clientRoles) {
            return clientRoles
                .map((role) => this.mapClientRoleToOption(role))
                .sort((a, b) => b.position - a.position)
        }

        const apiRoles = await this.fetchApiGuildRoles(
            `${DISCORD_API_BASE_URL}/guilds/${guildId}/roles`,
            'Failed to fetch guild roles',
        )
        return apiRoles
            .filter((role) => role.id !== guildId)
            .map((role) => this.mapApiRoleToOption(role))
            .sort((a, b) => b.position - a.position)
    }

    async getFullGuildRoles(guildId: string): Promise<GuildRoleManage[]> {
        const clientRoles = await this.fetchClientGuildRoles(
            guildId,
            'Failed to fetch full guild roles from bot client',
        )
        if (clientRoles) {
            return clientRoles
                .map((role) => this.mapClientRoleToManage(role))
                .sort((a, b) => b.position - a.position)
        }

        const apiRoles = await this.fetchApiGuildRoles(
            `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles`,
            'Failed to fetch full guild roles',
        )
        return apiRoles
            .filter((role) => role.id !== guildId)
            .map((role) => this.mapApiRoleToManage(role))
            .sort((a, b) => b.position - a.position)
    }

    async createGuildRole(
        guildId: string,
        data: RoleUpsertData,
    ): Promise<GuildRoleManage> {
        const guild = await getServableGuild(guildId)

        if (guild) {
            const role = await guild.roles.create({
                ...this.buildClientRoleData(data),
                reason: 'Created via dashboard',
            })
            return this.mapClientRoleToManage(role)
        }

        return this.discordRoleWriteRequest(
            `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles`,
            { method: 'POST', body: data },
            'Failed to create guild role via API',
        )
    }

    async updateGuildRole(
        guildId: string,
        roleId: string,
        data: RoleUpsertData,
    ): Promise<GuildRoleManage> {
        const guild = await getServableGuild(guildId)

        if (guild) {
            const role = await this.fetchClientRole(guild, roleId)
            const updated = await role.edit({
                ...this.buildClientRoleData(data),
                reason: 'Updated via dashboard',
            })
            return this.mapClientRoleToManage(updated)
        }

        return this.discordRoleWriteRequest(
            `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`,
            { method: 'PATCH', body: data },
            'Failed to update guild role via API',
        )
    }

    async deleteGuildRole(guildId: string, roleId: string): Promise<void> {
        const guild = await getServableGuild(guildId)

        if (guild) {
            const role = await this.fetchClientRole(guild, roleId)
            await role.delete('Deleted via dashboard')
            return
        }

        await this.discordRoleWriteRequest(
            `${DISCORD_API_BASE_URL}/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`,
            { method: 'DELETE' },
            'Failed to delete guild role via API',
        )
    }
}

export const roleService = new RoleService()
