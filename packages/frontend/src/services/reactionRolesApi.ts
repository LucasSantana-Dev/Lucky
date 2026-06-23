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
    groupId?: string | null
    title?: string
    description?: string
    imageUrl?: string
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
            imageFile?: File,
        ): Promise<{ messageId: string }> => {
            let data: CreateReactionRolePayload | FormData = payload
            if (imageFile) {
                const fd = new FormData()
                fd.append('image', imageFile)
                fd.append('payload', JSON.stringify(payload))
                data = fd
            }
            const res = await client.post<{ messageId: string }>(
                `/guilds/${guildId}/reaction-roles`,
                data,
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
            imageFile?: File,
        ): Promise<{ messageId: string }> => {
            let data: UpdateReactionRolePayload | FormData = payload
            if (imageFile) {
                const fd = new FormData()
                fd.append('image', imageFile)
                fd.append('payload', JSON.stringify(payload))
                data = fd
            }
            const res = await client.put<{ messageId: string }>(
                `/guilds/${guildId}/reaction-roles/${messageId}`,
                data,
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
