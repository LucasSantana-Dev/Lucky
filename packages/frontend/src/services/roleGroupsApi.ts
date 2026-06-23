import type { AxiosInstance } from 'axios'

export interface RoleGroup {
    id: string
    guildId: string
    name: string
    color?: string
    hoist: boolean
    mentionable: boolean
    buttonStyle?: string
    defaultEmoji?: string | null
}

export interface CreateRoleGroupPayload {
    name: string
    fromMessageId?: string
    style?: Record<string, unknown>
}

export interface UpdateRoleGroupPayload {
    color?: string
    hoist?: boolean
    mentionable?: boolean
    buttonStyle?: string
    defaultEmoji?: string | null
}

export interface AddRolePayload {
    name: string
    label?: string
    emoji?: string
    colorOverride?: string
    dryRun?: boolean
}

export interface AddRoleDryRunResult {
    plan: {
        roleName: string
        color: string
        buttonLabel: string
        emoji?: string
    }
}

export interface AddRoleAppliedResult {
    status: 'ok' | 'partial_success'
    role: {
        id: string
        name: string
        color: string
    }
    mapping: {
        id: string
        roleId: string
        label: string
        emoji?: string | null
    }
}

export function createRoleGroupsApi(client: AxiosInstance) {
    return {
        list: async (guildId: string): Promise<RoleGroup[]> => {
            const res = await client.get<{ groups: RoleGroup[] }>(
                `/guilds/${guildId}/role-groups`,
            )
            return res.data.groups
        },

        create: async (
            guildId: string,
            payload: CreateRoleGroupPayload,
        ): Promise<RoleGroup> => {
            const res = await client.post<RoleGroup>(
                `/guilds/${guildId}/role-groups`,
                payload,
            )
            return res.data
        },

        get: async (guildId: string, groupId: string): Promise<RoleGroup> => {
            const res = await client.get<RoleGroup>(
                `/guilds/${guildId}/role-groups/${groupId}`,
            )
            return res.data
        },

        updateTemplate: async (
            guildId: string,
            groupId: string,
            payload: UpdateRoleGroupPayload,
        ): Promise<RoleGroup> => {
            const res = await client.patch<RoleGroup>(
                `/guilds/${guildId}/role-groups/${groupId}`,
                payload,
            )
            return res.data
        },

        addRole: async (
            guildId: string,
            groupId: string,
            payload: AddRolePayload,
        ): Promise<AddRoleDryRunResult | AddRoleAppliedResult> => {
            const res = await client.post<
                AddRoleDryRunResult | AddRoleAppliedResult
            >(`/guilds/${guildId}/role-groups/${groupId}/roles`, payload)
            return res.data
        },

        detachRole: async (
            guildId: string,
            groupId: string,
            roleId: string,
        ): Promise<boolean> => {
            const res = await client.delete<{ success: boolean }>(
                `/guilds/${guildId}/role-groups/${groupId}/roles/${roleId}`,
            )
            return res.data.success
        },
    }
}
