import { create } from 'zustand'
import type { Feature, FeatureToggleName, FeatureToggleState } from '@/types'
import { api } from '@/services/api'

interface FeaturesState {
    features: Feature[]
    globalToggles: FeatureToggleState
    serverToggles: Record<string, FeatureToggleState>
    isLoading: boolean
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
    getServerToggles: (guildId: string) => FeatureToggleState
}

const createDefaultToggles = (): FeatureToggleState => {
    const toggleNames: FeatureToggleName[] = [
        'DOWNLOAD_VIDEO',
        'DOWNLOAD_AUDIO',
        'MUSIC_RECOMMENDATIONS',
        'AUTOPLAY',
        'LYRICS',
        'QUEUE_MANAGEMENT',
        'REACTION_ROLES',
        'ROLE_MANAGEMENT',
    ]
    return toggleNames.reduce((acc, name) => {
        acc[name] = true
        return acc
    }, {} as FeatureToggleState)
}

const defaultToggles = createDefaultToggles()

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
    features: [],
    globalToggles: defaultToggles,
    serverToggles: {},
    isLoading: false,

    fetchFeatures: async () => {
        set({ isLoading: true })
        try {
            const response = await api.features.list()
            const features = response.data.features.map((f) => ({
                ...f,
                isGlobal: false,
            }))
            set({ features, isLoading: false })
        } catch {
            set({ features: [], isLoading: false })
        }
    },

    fetchGlobalToggles: async () => {
        set({ isLoading: true })
        try {
            const response = await api.features.getGlobalToggles()
            set({ globalToggles: response.data.toggles, isLoading: false })
        } catch {
            set({ globalToggles: defaultToggles, isLoading: false })
        }
    },

    fetchServerToggles: async (guildId) => {
        set({ isLoading: true })
        try {
            const response = await api.features.getServerToggles(guildId)
            const current = get().serverToggles
            set({
                serverToggles: { ...current, [guildId]: response.data.toggles },
                isLoading: false,
            })
        } catch {
            const current = get().serverToggles
            if (!current[guildId]) {
                set({
                    serverToggles: {
                        ...current,
                        [guildId]: { ...defaultToggles },
                    },
                    isLoading: false,
                })
            } else {
                set({ isLoading: false })
            }
        }
    },

    updateGlobalToggle: async (name, enabled) => {
        try {
            await api.features.updateGlobalToggle(name, enabled)
            set((state) => ({
                globalToggles: { ...state.globalToggles, [name]: enabled },
            }))
        } catch {}
    },

    updateServerToggle: async (guildId, name, enabled) => {
        try {
            await api.features.updateServerToggle(guildId, name, enabled)
            set((state) => ({
                serverToggles: {
                    ...state.serverToggles,
                    [guildId]: {
                        ...(state.serverToggles[guildId] || defaultToggles),
                        [name]: enabled,
                    },
                },
            }))
        } catch {}
    },

    getServerToggles: (guildId) =>
        get().serverToggles[guildId] || defaultToggles,
}))
