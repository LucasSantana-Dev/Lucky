import type { AxiosInstance } from 'axios'
import type { ServerLog } from '@/types'

export function createLogsApi(apiClient: AxiosInstance) {
    return {
        getRecent: (guildId: string, limit?: number) =>
            apiClient.get<{ logs: ServerLog[] }>(`/guilds/${guildId}/logs`, {
                params: limit ? { limit } : {},
            }),
        getByType: (guildId: string, type: string, limit?: number) =>
            apiClient.get<{ logs: ServerLog[] }>(`/guilds/${guildId}/logs`, {
                params: { type, ...(limit ? { limit } : {}) },
            }),
        search: (
            guildId: string,
            filters: { type?: string; userId?: string },
        ) =>
            apiClient.get<{ logs: ServerLog[] }>(
                `/guilds/${guildId}/logs/search`,
                { params: filters },
            ),
        getUserLogs: (guildId: string, userId: string) =>
            apiClient.get<{ logs: ServerLog[] }>(
                `/guilds/${guildId}/logs/users/${userId}`,
            ),
        getStats: (guildId: string) =>
            apiClient.get(`/guilds/${guildId}/logs/stats`),
    }
}
