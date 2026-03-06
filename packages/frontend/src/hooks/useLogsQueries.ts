import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { LogCategory } from '@/types'

export function useActivityLogs(guildId: string | undefined) {
    return useQuery({
        queryKey: ['logs', 'activity', guildId],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.logs.getActivity(guildId)
            return response.data.logs
        },
        enabled: !!guildId,
    })
}

export function useServerLogsByCategory(
    guildId: string | undefined,
    category: LogCategory,
) {
    return useQuery({
        queryKey: ['logs', category, guildId],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.logs.getByCategory(guildId, category)
            return response.data.logs
        },
        enabled: !!guildId && !!category,
    })
}
