import { create } from 'zustand'
import type { Feature, FeatureToggleName, FeatureToggleState } from '@/types'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'

export type FeatureLoadErrorKind = 'auth' | 'forbidden' | 'network' | 'upstream'

export interface FeatureLoadErrorState {
    kind: FeatureLoadErrorKind
    message: string
    status?: number
    scope: 'catalog' | 'global' | 'server'
}

function classifyFeatureLoadError(
    error: unknown,
    scope: FeatureLoadErrorState['scope'],
): FeatureLoadErrorState {
    if (error instanceof ApiError) {
        if (error.status === 401) {
            return {
                kind: 'auth',
                message: error.message,
                status: error.status,
                scope,
            }
        }
        if (error.status === 403) {
            return {
                kind: 'forbidden',
                message: error.message,
                status: error.status,
                scope,
            }
        }
        if (error.status === 0) {
            return {
                kind: 'network',
                message: error.message,
                status: error.status,
                scope,
            }
        }
        return {
            kind: 'upstream',
            message: error.message,
            status: error.status,
            scope,
        }
    }

    if (error instanceof Error) {
        return {
            kind: 'upstream',
            message: error.message,
            scope,
        }
    }

    return {
        kind: 'upstream',
        message: 'Feature data is currently unavailable',
        scope,
    }
}

interface FeaturesState {
    features: Feature[]
    globalToggles: FeatureToggleState
    serverToggles: Record<string, FeatureToggleState>
    isLoading: boolean
    loadError: FeatureLoadErrorState | null
    clearLoadError: () => void
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
    loadError: null,

    clearLoadError: () => {
        set({ loadError: null })
    },

    fetchFeatures: async () => {
        set({ isLoading: true, loadError: null })
        try {
            const response = await api.features.list()
            const features = response.data.features.map((f) => ({
                ...f,
                isGlobal: false,
            }))
            set({ features, isLoading: false, loadError: null })
        } catch (error) {
            set({
                features: [],
                isLoading: false,
                loadError: classifyFeatureLoadError(error, 'catalog'),
            })
        }
    },

    fetchGlobalToggles: async () => {
        set({ isLoading: true, loadError: null })
        try {
            const response = await api.features.getGlobalToggles()
            set({
                globalToggles: response.data.toggles,
                isLoading: false,
                loadError: null,
            })
        } catch (error) {
            set({
                globalToggles: defaultToggles,
                isLoading: false,
                loadError: classifyFeatureLoadError(error, 'global'),
            })
        }
    },

    fetchServerToggles: async (guildId) => {
        set({ isLoading: true, loadError: null })
        try {
            const response = await api.features.getServerToggles(guildId)
            const current = get().serverToggles
            set({
                serverToggles: { ...current, [guildId]: response.data.toggles },
                isLoading: false,
                loadError: null,
            })
        } catch (error) {
            const current = get().serverToggles
            if (!current[guildId]) {
                set({
                    serverToggles: {
                        ...current,
                        [guildId]: { ...defaultToggles },
                    },
                    isLoading: false,
                    loadError: classifyFeatureLoadError(error, 'server'),
                })
            } else {
                set({
                    isLoading: false,
                    loadError: classifyFeatureLoadError(error, 'server'),
                })
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
