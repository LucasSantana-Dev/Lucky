import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import type {
    ModerationStats,
} from '@/types'
import type { ModerationCaseFilters } from '@/services/moderationApi'

export function useModerationStats(guildId: string | undefined) {
    return useQuery({
        queryKey: ['moderation', 'stats', guildId],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.moderation.getStats(guildId)
            return response.data.stats as ModerationStats
        },
        enabled: !!guildId,
    })
}

export function useModerationCases(
    guildId: string | undefined,
    filters?: ModerationCaseFilters,
) {
    return useQuery({
        queryKey: ['moderation', 'cases', guildId, filters],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.moderation.getCases(guildId, filters)
            return response.data
        },
        enabled: !!guildId,
    })
}

