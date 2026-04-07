import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export function useStarboardTop(guildId: string | undefined, limit = 3) {
    return useQuery({
        queryKey: ['starboard', 'top', guildId, limit],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const entries = await api.starboard.getTopEntries(guildId, limit)
            return entries
        },
        enabled: !!guildId,
    })
}
