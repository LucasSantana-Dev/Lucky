import type { AxiosInstance } from 'axios'

export interface ReactionRoleMapping {
    id: string
    roleId: string
    buttonId: string
    type: string
    label: string
    style: string
    emoji: string | null
}

export interface ReactionRoleMessage {
    id: string
    messageId: string
    channelId: string
    guildId: string
    createdAt: string
    mappings: ReactionRoleMapping[]
}

export interface RoleExclusion {
    id: string
    guildId: string
    roleId: string
    groupId: string
}

export interface CreateReactionRoleEntry {
    roleId: string
    label: string
    emoji?: string
    style?: 'Primary' | 'Secondary' | 'Success' | 'Danger'
}

export interface CreateReactionRolePayload {
    channelId: string
    title: string
    description: string
    imageUrl?: string
    roles: CreateReactionRoleEntry[]
}

export interface UpdateReactionRolePayload {
    title: string
    description: string
    imageUrl?: string
    roles: CreateReactionRoleEntry[]
}

export function createReactionRolesApi(client: AxiosInstance) {
    return {
        list: async (guildId: string): Promise<ReactionRoleMessage[]> => {
            const res = await client.get<{ messages: ReactionRoleMessage[] }>(
                `/guilds/${guildId}/reaction-roles`,
            )
            return res.data.messages
        },
        create: async (
            guildId: string,
            payload: CreateReactionRolePayload,
        ): Promise<{ messageId: string }> => {
            const res = await client.post<{ messageId: string }>(
                `/guilds/${guildId}/reaction-roles`,
                payload,
            )
            return res.data
        },
        delete: async (guildId: string, messageId: string): Promise<void> => {
            await client.delete(
                `/guilds/${guildId}/reaction-roles/${messageId}`,
            )
        },
        update: async (
            guildId: string,
            messageId: string,
            payload: UpdateReactionRolePayload,
        ): Promise<{ messageId: string }> => {
            const res = await client.put<{ messageId: string }>(
                `/guilds/${guildId}/reaction-roles/${messageId}`,
                payload,
            )
            return res.data
        },
        listExclusions: async (guildId: string): Promise<RoleExclusion[]> => {
            const res = await client.get<{ exclusions: RoleExclusion[] }>(
                `/guilds/${guildId}/roles/exclusive`,
            )
            return res.data.exclusions
        },
    }
}
