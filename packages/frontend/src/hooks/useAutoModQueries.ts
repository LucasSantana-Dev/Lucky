import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { AutoModSettings } from '@/types'

export function useAutoModSettings(guildId: string | undefined) {
    return useQuery({
        queryKey: ['automod', 'settings', guildId],
        queryFn: async () => {
            if (!guildId) throw new Error('Guild ID is required')
            const response = await api.automod.getSettings(guildId)
            return response.data.settings as AutoModSettings
        },
        enabled: !!guildId,
    })
}

export function useUpdateAutoModSettings() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            guildId,
            settings,
        }: {
            guildId: string
            settings: Partial<AutoModSettings>
        }) => {
            const response = await api.automod.updateSettings(guildId, settings)
            return response.data.settings
        },
        onSuccess: (_, { guildId }) => {
            queryClient.invalidateQueries({
                queryKey: ['automod', 'settings', guildId],
            })
        },
    })
}

export function useAddAutoModWord() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            guildId,
            word,
        }: {
            guildId: string
            word: string
        }) => {
            await api.automod.addWord(guildId, word)
        },
        onSuccess: (_, { guildId }) => {
            queryClient.invalidateQueries({
                queryKey: ['automod', 'settings', guildId],
            })
        },
    })
}

export function useRemoveAutoModWord() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            guildId,
            word,
        }: {
            guildId: string
            word: string
        }) => {
            await api.automod.removeWord(guildId, word)
        },
        onSuccess: (_, { guildId }) => {
            queryClient.invalidateQueries({
                queryKey: ['automod', 'settings', guildId],
            })
        },
    })
}
