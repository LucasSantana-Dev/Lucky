import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

export function useLevelLeaderboard(guildId: string | undefined, limit = 5) {
    return useQuery({
        queryKey: ['levels', 'leaderboard', guildId, limit],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const leaderboard = await api.levels.getLeaderboard(guildId, limit)
            return leaderboard
        },
        enabled: !!guildId,
    })
}
