import { create } from 'zustand'
import type {
    Feature,
    FeatureToggleState,
    FeatureToggleName,
} from '../types/feature'
import api from '../services/api'

const createEmptyToggleState = (): FeatureToggleState => ({
    DOWNLOAD_VIDEO: false,
    DOWNLOAD_AUDIO: false,
    MUSIC_RECOMMENDATIONS: false,
    AUTOPLAY: false,
    LYRICS: false,
    QUEUE_MANAGEMENT: false,
    REACTION_ROLES: false,
    ROLE_MANAGEMENT: false,
})

interface FeatureState {
    globalToggles: FeatureToggleState
    serverToggles: FeatureToggleState
    features: Feature[]
    isLoading: boolean
    isDeveloper: boolean
    fetchFeatures: () => Promise<void>
    fetchGlobalToggles: () => Promise<void>
    fetchServerToggles: (guildId: string) => Promise<void>
    updateGlobalToggle: (
        name: FeatureToggleName,
        enabled: boolean,
    ) => Promise<void>
    updateServerToggle: (
        guildId: string,
        name: FeatureToggleName,
        enabled: boolean,
    ) => Promise<void>
    checkDeveloperStatus: () => Promise<void>
}

export const useFeatureStore = create<FeatureState>((set) => ({
    globalToggles: createEmptyToggleState(),
    serverToggles: createEmptyToggleState(),
    features: [],
    isLoading: false,
    isDeveloper: false,
    fetchFeatures: async () => {
        try {
            const response = await api.get<{ features: Feature[] }>('/features')
            set({ features: response.data.features })
        } catch {
            set({ features: [] })
        }
    },
    fetchGlobalToggles: async () => {
        set({ isLoading: true })
        try {
            const response = await api.get<{ toggles: FeatureToggleState }>(
                '/toggles/global',
            )
            set({ globalToggles: response.data.toggles, isLoading: false })
        } catch {
            set({ globalToggles: createEmptyToggleState(), isLoading: false })
        }
    },
    fetchServerToggles: async (guildId: string) => {
        set({ isLoading: true })
        try {
            const response = await api.get<{ toggles: FeatureToggleState }>(
                `/guilds/${guildId}/features`,
            )
            set({ serverToggles: response.data.toggles, isLoading: false })
        } catch {
            set({ serverToggles: createEmptyToggleState(), isLoading: false })
        }
    },
    updateGlobalToggle: async (name: FeatureToggleName, enabled: boolean) => {
        try {
            await api.post(`/toggles/global/${name}`, { enabled })
            set((state) => ({
                globalToggles: { ...state.globalToggles, [name]: enabled },
            }))
        } catch {}
    },
    updateServerToggle: async (
        guildId: string,
        name: FeatureToggleName,
        enabled: boolean,
    ) => {
        try {
            await api.post(`/guilds/${guildId}/features/${name}`, { enabled })
            set((state) => ({
                serverToggles: { ...state.serverToggles, [name]: enabled },
            }))
        } catch {}
    },
    checkDeveloperStatus: async () => {
        try {
            await api.get('/toggles/global')
            set({ isDeveloper: true })
        } catch {
            set({ isDeveloper: false })
        }
    },
}))
