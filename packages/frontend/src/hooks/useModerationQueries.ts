import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import type {
    ModerationCase,
    ModerationStats,
    ModerationSettings,
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

export function useModerationSettings(guildId: string | undefined) {
    return useQuery({
        queryKey: ['moderation', 'settings', guildId],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.moderation.getSettings(guildId)
            return response.data.settings as ModerationSettings
        },
        enabled: !!guildId,
    })
}

export function useUpdateModerationSettings() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            guildId,
            settings,
        }: {
            guildId: string
            settings: Partial<ModerationSettings>
        }) => {
            const response = await api.moderation.updateSettings(
                guildId,
                settings,
            )
            return response.data.settings
        },
        onSuccess: (_, { guildId }) => {
            queryClient.invalidateQueries({
                queryKey: ['moderation', 'settings', guildId],
            })
        },
    })
}

export function useModerationCase(
    caseNumber: number | undefined,
    guildId: string | undefined,
) {
    return useQuery({
        queryKey: ['moderation', 'case', guildId, caseNumber],
        queryFn: async () => {
            if (!guildId || !caseNumber)
                throw new Error('Guild ID and case number are required')
            const response = await api.moderation.getCase(guildId, caseNumber)
            return response.data.case as ModerationCase
        },
        enabled: !!guildId && !!caseNumber,
    })
}
