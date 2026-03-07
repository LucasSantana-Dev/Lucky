import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export function useRecentLogs(guildId: string | undefined, limit?: number) {
    return useQuery({
        queryKey: ['logs', 'recent', guildId, limit],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.serverLogs.getRecent(guildId, limit)
            return response.data.logs
        },
        enabled: !!guildId,
    })
}

export function useLogsByType(
    guildId: string | undefined,
    type: string,
    limit?: number,
) {
    return useQuery({
        queryKey: ['logs', 'type', guildId, type, limit],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.serverLogs.getByType(
                guildId,
                type,
                limit,
            )
            return response.data.logs
        },
        enabled: !!guildId && !!type,
    })
}

export function useLogStats(guildId: string | undefined) {
    return useQuery({
        queryKey: ['logs', 'stats', guildId],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.serverLogs.getStats(guildId)
            return response.data
        },
        enabled: !!guildId,
    })
}
