import { create } from 'zustand'
import type {
    Feature,
    FeatureToggleName,
    FeatureToggleState,
    GlobalFeatureToggleProvider,
} from '@/types'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'

export type FeatureLoadErrorKind = 'auth' | 'forbidden' | 'network' | 'upstream'

export interface FeatureLoadErrorState {
    kind: FeatureLoadErrorKind
    message: string
    status?: number
    scope: 'catalog' | 'global'
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
    globalToggleProvider: GlobalFeatureToggleProvider
    globalTogglesWritable: boolean
    isLoading: boolean
    loadError: FeatureLoadErrorState | null
    clearLoadError: () => void
    fetchFeatures: () => Promise<void>
    fetchGlobalToggles: () => Promise<void>
    updateGlobalToggle: (
        name: FeatureToggleName,
        enabled: boolean,
    ) => Promise<void>
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
        'MODERATION',
        'AUTOMOD',
        'CUSTOM_COMMANDS',
        'AUTO_MESSAGES',
        'SERVER_LOGS',
        'WEBAPP',
        'TWITCH_NOTIFICATIONS',
        'LASTFM_INTEGRATION',
        'SPOTIFY_INTEGRATION',
        'WELCOME_MESSAGES',
    ]
    const disabledByDefault: FeatureToggleName[] = [
        'LYRICS',
        'SPOTIFY_INTEGRATION',
    ]
    return toggleNames.reduce((acc, name) => {
        acc[name] = !disabledByDefault.includes(name)
        return acc
    }, {} as FeatureToggleState)
}

const defaultToggles = createDefaultToggles()

export const useFeaturesStore = create<FeaturesState>((set) => ({
    features: [],
    globalToggles: defaultToggles,
    globalToggleProvider: 'environment',
    globalTogglesWritable: false,
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
                globalToggleProvider: response.data.provider ?? 'environment',
                globalTogglesWritable: response.data.writable ?? false,
                isLoading: false,
                loadError: null,
            })
        } catch (error) {
            set({
                globalToggles: defaultToggles,
                globalToggleProvider: 'environment',
                globalTogglesWritable: false,
                isLoading: false,
                loadError: classifyFeatureLoadError(error, 'global'),
            })
        }
    },

    updateGlobalToggle: async (name, enabled) => {
        // Store original value for rollback
        const previousValue = useFeaturesStore.getState().globalToggles[name]

        // Optimistic update
        set((state) => ({
            globalToggles: { ...state.globalToggles, [name]: enabled },
        }))

        try {
            await api.features.updateGlobalToggle(name, enabled)
        } catch (error) {
            // Rollback on failure
            set((state) => ({
                globalToggles: {
                    ...state.globalToggles,
                    [name]: previousValue,
                },
            }))
            throw error
        }
    },
}))
