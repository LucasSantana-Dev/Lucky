import type { AxiosInstance } from 'axios'
import type { ServerLog } from '@/types'

export function createLogsApi(apiClient: AxiosInstance) {
    return {
        search: (
            guildId: string,
            filters: {
                q?: string
                type?: string
                userId?: string
                limit?: number
                offset?: number
            },
        ) =>
            apiClient.get<{ logs: ServerLog[]; total: number }>(
                `/guilds/${guildId}/logs/search`,
                {
                    params: {
                        ...(filters.q ? { q: filters.q } : {}),
                        ...(filters.type ? { type: filters.type } : {}),
                        ...(filters.userId ? { userId: filters.userId } : {}),
                        ...(filters.limit ? { limit: filters.limit } : {}),
                        ...(filters.offset !== undefined
                            ? { offset: filters.offset }
                            : {}),
                    },
                },
            ),
        getUserLogs: (guildId: string, userId: string) =>
            apiClient.get<{ logs: ServerLog[] }>(
                `/guilds/${guildId}/logs/users/${userId}`,
            ),
        getSettings: (guildId: string) =>
            apiClient.get<{ enabled: boolean }>(
                `/guilds/${guildId}/logs/settings`,
            ),
        updateSettings: (guildId: string, enabled: boolean) =>
            apiClient.put<{ enabled: boolean }>(
                `/guilds/${guildId}/logs/settings`,
                { enabled },
            ),
        getStats: (guildId: string) =>
            apiClient.get(`/guilds/${guildId}/logs/stats`),
    }
}
