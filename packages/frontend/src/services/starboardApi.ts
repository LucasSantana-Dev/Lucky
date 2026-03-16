import type { AxiosInstance } from 'axios'

export interface StarboardConfig {
    id: string
    guildId: string
    channelId: string
    emoji: string
    threshold: number
    selfStar: boolean
    createdAt: string
    updatedAt: string
}

export interface StarboardEntry {
    id: string
    guildId: string
    messageId: string
    channelId: string
    authorId: string
    starboardMsgId: string | null
    starCount: number
    content: string | null
    createdAt: string
    updatedAt: string
}

export interface UpdateStarboardConfigInput {
    channelId?: string
    emoji?: string
    threshold?: number
    selfStar?: boolean
}

export function createStarboardApi(client: AxiosInstance) {
    return {
        async getConfig(guildId: string): Promise<StarboardConfig | null> {
            const res = await client.get<{ config: StarboardConfig | null }>(
                `/guilds/${guildId}/starboard/config`,
            )
            return res.data.config
        },

        async updateConfig(
            guildId: string,
            data: UpdateStarboardConfigInput,
        ): Promise<StarboardConfig> {
            const res = await client.patch<{ config: StarboardConfig }>(
                `/guilds/${guildId}/starboard/config`,
                data,
            )
            return res.data.config
        },

        async deleteConfig(guildId: string): Promise<void> {
            await client.delete(`/guilds/${guildId}/starboard/config`)
        },

        async getTopEntries(guildId: string, limit = 10): Promise<StarboardEntry[]> {
            const res = await client.get<{ entries: StarboardEntry[] }>(
                `/guilds/${guildId}/starboard/entries`,
                { params: { limit } },
            )
            return res.data.entries
        },
    }
}
