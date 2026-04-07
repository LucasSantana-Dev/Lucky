import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export function useRecentTracks(guildId: string | undefined, limit = 5) {
    return useQuery({
        queryKey: ['trackHistory', 'recent', guildId, limit],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.trackHistory.getHistory(guildId, limit)
            return response.data.history
        },
        enabled: !!guildId,
    })
}
