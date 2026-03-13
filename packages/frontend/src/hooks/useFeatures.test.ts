import { beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFeatures } from './useFeatures'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { useFeaturesStore } from '@/stores/featuresStore'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')
vi.mock('@/stores/featuresStore')

type AuthState = {
    isDeveloper: boolean
}

type GuildState = {
    selectedGuild: { id: string } | null
}

type FeaturesState = {
    globalToggles: Record<string, boolean>
    isLoading: boolean
    features: Array<{ name: string; description: string; isGlobal: boolean }>
    fetchFeatures: () => Promise<void>
    fetchGlobalToggles: () => Promise<void>
    fetchServerToggles: (guildId: string) => Promise<void>
    updateGlobalToggle: (name: string, enabled: boolean) => Promise<void>
    updateServerToggle: (
        guildId: string,
        name: string,
        enabled: boolean,
    ) => Promise<void>
    getServerToggles: (guildId: string) => Record<string, boolean>
}

describe('useFeatures', () => {
    const fetchFeatures = vi.fn<() => Promise<void>>()
    const fetchGlobalToggles = vi.fn<() => Promise<void>>()
    const fetchServerToggles = vi.fn<(guildId: string) => Promise<void>>()
    const updateGlobalToggle = vi.fn()
    const updateServerToggle = vi.fn()
    const getServerToggles = vi.fn()

    let authState: AuthState
    let guildState: GuildState
    let featuresState: FeaturesState

    beforeEach(() => {
        vi.clearAllMocks()
        fetchFeatures.mockResolvedValue()
        fetchGlobalToggles.mockResolvedValue()
        fetchServerToggles.mockResolvedValue()
        getServerToggles.mockReturnValue({ DOWNLOAD_VIDEO: true })

        authState = {
            isDeveloper: false,
        }
        guildState = {
            selectedGuild: null,
        }
        featuresState = {
            globalToggles: { DOWNLOAD_VIDEO: true },
            isLoading: false,
            features: [],
            fetchFeatures,
            fetchGlobalToggles,
            fetchServerToggles,
            updateGlobalToggle,
            updateServerToggle,
            getServerToggles,
        }

        vi.mocked(useAuthStore).mockImplementation(
            ((selector: (state: AuthState) => unknown) => selector(authState)) as
                typeof useAuthStore,
        )
        vi.mocked(useGuildStore).mockImplementation(
            ((selector: (state: GuildState) => unknown) =>
                selector(guildState)) as typeof useGuildStore,
        )
        vi.mocked(useFeaturesStore).mockImplementation(
            ((selector: (state: FeaturesState) => unknown) =>
                selector(featuresState)) as typeof useFeaturesStore,
        )
    })

    test('does not fetch global toggles for non-developer users', async () => {
        renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).toHaveBeenCalledTimes(1)
        })

        expect(fetchGlobalToggles).not.toHaveBeenCalled()
    })

    test('fetches global toggles for developer users', async () => {
        authState.isDeveloper = true

        renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).toHaveBeenCalledTimes(1)
            expect(fetchGlobalToggles).toHaveBeenCalledTimes(1)
        })
    })

    test('fetches server toggles when a guild is selected', async () => {
        guildState.selectedGuild = { id: 'guild-1' }

        renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchServerToggles).toHaveBeenCalledWith('guild-1')
        })
    })
})
