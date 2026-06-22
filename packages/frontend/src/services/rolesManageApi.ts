import type { AxiosInstance } from 'axios'

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

export function createRolesManageApi(client: AxiosInstance) {
    return {
        list: async (guildId: string): Promise<GuildRoleManage[]> => {
            try {
                const res = await client.get<{ roles: GuildRoleManage[] }>(
                    `/guilds/${guildId}/roles/manage`,
                )
                return res.data.roles
            } catch {
                return null
            }
        },

        create: async (
            guildId: string,
            data: RoleUpsertData,
        ): Promise<GuildRoleManage | null> => {
            try {
                const res = await client.post<{ role: GuildRoleManage }>(
                    `/guilds/${guildId}/roles/manage`,
                    data,
                )
                return res.data.role
            } catch {
                return null
            }
        },

        update: async (
            guildId: string,
            roleId: string,
            data: RoleUpsertData,
        ): Promise<GuildRoleManage | null> => {
            try {
                const res = await client.patch<{ role: GuildRoleManage }>(
                    `/guilds/${guildId}/roles/manage/${roleId}`,
                    data,
                )
                return res.data.role
            } catch {
                return null
            }
        },

        delete: async (
            guildId: string,
            roleId: string,
        ): Promise<boolean> => {
            try {
                await client.delete(`/guilds/${guildId}/roles/manage/${roleId}`)
                return true
            } catch {
                return false
            }
        },

        duplicate: async (
            guildId: string,
            roleId: string,
        ): Promise<GuildRoleManage | null> => {
            try {
                const res = await client.post<{ role: GuildRoleManage }>(
                    `/guilds/${guildId}/roles/manage/${roleId}/duplicate`,
                )
                return res.data.role
            } catch {
                return null
            }
        },

        bulkDelete: async (
            guildId: string,
            roleIds: string[],
        ): Promise<{ deleted: string[]; failed: string[] } | null> => {
            try {
                const res = await client.post<{
                    deleted: string[]
                    failed: string[]
                }>(`/guilds/${guildId}/roles/manage/bulk-delete`, { roleIds })
                return res.data
            } catch {
                return null
            }
        },
    }
}
