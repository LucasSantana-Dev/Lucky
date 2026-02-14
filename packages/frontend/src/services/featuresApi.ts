import type { AxiosInstance } from 'axios'
import type { Feature, FeatureToggleState } from '@/types'

export function createFeaturesApi(apiClient: AxiosInstance) {
    return {
        list: async () => {
            const response = await apiClient.get<{
                features: Array<{ name: string; description: string }>
            }>('/features')
            return {
                ...response,
                data: {
                    features: response.data.features.map((f) => ({
                        ...f,
                        isGlobal: false,
                    })) as Feature[],
                },
            }
        },
        getGlobalToggles: () =>
            apiClient.get<{ toggles: FeatureToggleState }>('/toggles/global'),
        updateGlobalToggle: (name: string, enabled: boolean) =>
            apiClient.post<{
                success: boolean
                message?: string
                note?: string
            }>(`/toggles/global/${name}`, { enabled }),
        getServerToggles: async (guildId: string) => {
            const response = await apiClient.get<{
                guildId: string
                toggles: FeatureToggleState
            }>(`/guilds/${guildId}/features`)
            return { ...response, data: { toggles: response.data.toggles } }
        },
        updateServerToggle: (guildId: string, name: string, enabled: boolean) =>
            apiClient.post<{
                success: boolean
                message?: string
                note?: string
            }>(`/guilds/${guildId}/features/${name}`, { enabled }),
    }
}
