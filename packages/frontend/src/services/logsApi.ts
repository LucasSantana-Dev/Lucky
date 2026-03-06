import type { AxiosInstance } from 'axios'
import type { ServerLog, LogFilter } from '@/types'

export function createLogsApi(apiClient: AxiosInstance) {
    return {
        getLogs: (guildId: string, filters?: LogFilter) =>
            apiClient.get<{ logs: ServerLog[]; total: number }>(
                `/guilds/${guildId}/logs`,
                { params: filters },
            ),
        getLog: (guildId: string, logId: string) =>
            apiClient.get<{ log: ServerLog }>(
                `/guilds/${guildId}/logs/${logId}`,
            ),
        clearLogs: (guildId: string) =>
            apiClient.delete<{ success: boolean }>(`/guilds/${guildId}/logs`),
        exportLogs: (guildId: string, filters?: LogFilter) =>
            apiClient.get<Blob>(`/guilds/${guildId}/logs/export`, {
                params: filters,
                responseType: 'blob',
            }),
    }
}
