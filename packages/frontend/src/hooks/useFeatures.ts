import { useEffect } from 'react'
import { toast } from 'sonner'
import { useFeaturesStore } from '@/stores/featuresStore'
import { useAuthStore } from '@/stores/authStore'
import type { FeatureToggleName } from '@/types'

export function useFeatures() {
    const isDeveloper = useAuthStore((state) => state.isDeveloper)
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const isAuthLoading = useAuthStore((state) => state.isLoading)
    const globalToggles = useFeaturesStore((state) => state.globalToggles)
    const globalToggleProvider = useFeaturesStore(
        (state) => state.globalToggleProvider,
    )
    const globalTogglesWritable = useFeaturesStore(
        (state) => state.globalTogglesWritable,
    )
    const isLoading = useFeaturesStore((state) => state.isLoading)
    const features = useFeaturesStore((state) => state.features)
    const loadError = useFeaturesStore((state) => state.loadError)
    const fetchFeatures = useFeaturesStore((state) => state.fetchFeatures)
    const fetchGlobalToggles = useFeaturesStore(
        (state) => state.fetchGlobalToggles,
    )
    const updateGlobalToggle = useFeaturesStore(
        (state) => state.updateGlobalToggle,
    )
    const clearLoadError = useFeaturesStore((state) => state.clearLoadError)

    useEffect(() => {
        if (isAuthLoading || !isAuthenticated) {
            return
        }

        fetchFeatures()
        if (isDeveloper) {
            fetchGlobalToggles()
        }
    }, [
        fetchFeatures,
        fetchGlobalToggles,
        isDeveloper,
        isAuthenticated,
        isAuthLoading,
    ])

    const handleGlobalToggle = (name: FeatureToggleName, enabled: boolean) => {
        updateGlobalToggle(name, enabled).catch(() => {
            toast.error('Failed to update global toggle')
        })
    }

    const retryLoad = () => {
        clearLoadError()
        if (isAuthLoading || !isAuthenticated) {
            return
        }

        fetchFeatures()
        if (isDeveloper) {
            fetchGlobalToggles()
        }
    }

    return {
        globalToggles,
        globalToggleProvider,
        globalTogglesWritable,
        isLoading,
        features,
        loadError,
        isDeveloper,
        retryLoad,
        handleGlobalToggle,
    }
}
