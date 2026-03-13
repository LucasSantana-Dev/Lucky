import { useEffect } from 'react'
import { useFeaturesStore } from '@/stores/featuresStore'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import type { FeatureToggleName } from '@/types'

export function useFeatures() {
    const isDeveloper = useAuthStore((state) => state.isDeveloper)
    const selectedGuild = useGuildStore((state) => state.selectedGuild)
    const globalToggles = useFeaturesStore((state) => state.globalToggles)
    const isLoading = useFeaturesStore((state) => state.isLoading)
    const features = useFeaturesStore((state) => state.features)
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

    useEffect(() => {
        fetchFeatures()
        if (isDeveloper) {
            fetchGlobalToggles()
        }
    }, [fetchFeatures, fetchGlobalToggles, isDeveloper])

    useEffect(() => {
        if (selectedGuild) {
            fetchServerToggles(selectedGuild.id)
        }
    }, [selectedGuild, fetchServerToggles])

    const handleGlobalToggle = (name: FeatureToggleName, enabled: boolean) => {
        updateGlobalToggle(name, enabled)
    }

    const handleServerToggle = (name: FeatureToggleName, enabled: boolean) => {
        if (selectedGuild) {
            updateServerToggle(selectedGuild.id, name, enabled)
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
        isDeveloper,
        handleGlobalToggle,
        handleServerToggle,
    }
}
