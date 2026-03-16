import type { AxiosInstance } from 'axios'

export interface LevelConfig {
    id: string
    guildId: string
    enabled: boolean
    xpPerMessage: number
    xpCooldownMs: number
    announceChannel: string | null
    createdAt: string
    updatedAt: string
}

export interface MemberXP {
    id: string
    guildId: string
    userId: string
    xp: number
    level: number
    lastXpAt: string
    createdAt: string
    updatedAt: string
}

export interface LevelReward {
    id: string
    guildId: string
    level: number
    roleId: string
}

export interface UpdateLevelConfigInput {
    enabled?: boolean
    xpPerMessage?: number
    xpCooldownMs?: number
    announceChannel?: string | null
}

export interface AddRewardInput {
    level: number
    roleId: string
}

export function xpNeededForLevel(level: number): number {
    return level * level * 100
}

export function createLevelsApi(client: AxiosInstance) {
    return {
        async getConfig(guildId: string): Promise<LevelConfig | null> {
            const res = await client.get<{ config: LevelConfig | null }>(
                `/guilds/${guildId}/levels/config`,
            )
            return res.data.config
        },

        async updateConfig(guildId: string, data: UpdateLevelConfigInput): Promise<LevelConfig> {
            const res = await client.patch<{ config: LevelConfig }>(
                `/guilds/${guildId}/levels/config`,
                data,
            )
            return res.data.config
        },

        async getLeaderboard(guildId: string, limit = 10): Promise<MemberXP[]> {
            const res = await client.get<{ leaderboard: MemberXP[] }>(
                `/guilds/${guildId}/levels/leaderboard`,
                { params: { limit } },
            )
            return res.data.leaderboard
        },

        async getRank(guildId: string, userId: string): Promise<{ memberXp: MemberXP; rank: number }> {
            const res = await client.get<{ memberXp: MemberXP; rank: number }>(
                `/guilds/${guildId}/levels/rank/${userId}`,
            )
            return res.data
        },

        async getRewards(guildId: string): Promise<LevelReward[]> {
            const res = await client.get<{ rewards: LevelReward[] }>(
                `/guilds/${guildId}/levels/rewards`,
            )
            return res.data.rewards
        },

        async addReward(guildId: string, data: AddRewardInput): Promise<LevelReward> {
            const res = await client.post<{ reward: LevelReward }>(
                `/guilds/${guildId}/levels/rewards`,
                data,
            )
            return res.data.reward
        },

        async removeReward(guildId: string, level: number): Promise<void> {
            await client.delete(`/guilds/${guildId}/levels/rewards/${level}`)
        },
    }
}
