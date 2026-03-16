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

export function createReactionRolesApi(client: AxiosInstance) {
    return {
        list: async (guildId: string): Promise<ReactionRoleMessage[]> => {
            const res = await client.get<{ messages: ReactionRoleMessage[] }>(
                `/guilds/${guildId}/reaction-roles`,
            )
            return res.data.messages
        },
        listExclusions: async (guildId: string): Promise<RoleExclusion[]> => {
            const res = await client.get<{ exclusions: RoleExclusion[] }>(
                `/guilds/${guildId}/roles/exclusive`,
            )
            return res.data.exclusions
        },
    }
}
