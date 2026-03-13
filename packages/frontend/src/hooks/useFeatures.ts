import { useEffect } from 'react'
import { useFeaturesStore } from '@/stores/featuresStore'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import type { FeatureToggleName } from '@/types'

export function useFeatures() {
    const isDeveloper = useAuthStore((state) => state.isDeveloper)
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const isAuthLoading = useAuthStore((state) => state.isLoading)
    const selectedGuild = useGuildStore((state) => state.selectedGuild)
    const globalToggles = useFeaturesStore((state) => state.globalToggles)
    const isLoading = useFeaturesStore((state) => state.isLoading)
    const features = useFeaturesStore((state) => state.features)
    const loadError = useFeaturesStore((state) => state.loadError)
    const fetchFeatures = useFeaturesStore((state) => state.fetchFeatures)
    const fetchGlobalToggles = useFeaturesStore(
        (state) => state.fetchGlobalToggles,
    )
    const fetchServerToggles = useFeaturesStore(
        (state) => state.fetchServerToggles,
    )
    const updateGlobalToggle = useFeaturesStore(
        (state) => state.updateGlobalToggle,
    )
    const updateServerToggle = useFeaturesStore(
        (state) => state.updateServerToggle,
    )
    const getServerToggles = useFeaturesStore((state) => state.getServerToggles)
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

    useEffect(() => {
        if (isAuthLoading || !isAuthenticated) {
            return
        }

        if (selectedGuild) {
            fetchServerToggles(selectedGuild.id)
        }
    }, [selectedGuild, fetchServerToggles, isAuthenticated, isAuthLoading])

    const handleGlobalToggle = (name: FeatureToggleName, enabled: boolean) => {
        updateGlobalToggle(name, enabled)
    }

    const handleServerToggle = (name: FeatureToggleName, enabled: boolean) => {
        if (selectedGuild) {
            updateServerToggle(selectedGuild.id, name, enabled)
        }
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
        if (selectedGuild) {
            fetchServerToggles(selectedGuild.id)
        }
    }

    const serverToggles = selectedGuild
        ? getServerToggles(selectedGuild.id)
        : globalToggles

    return {
        globalToggles,
        serverToggles,
        isLoading,
        features,
        loadError,
        isDeveloper,
        retryLoad,
        handleGlobalToggle,
        handleServerToggle,
    }
}
