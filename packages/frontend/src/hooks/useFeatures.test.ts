import { beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useFeatures } from './useFeatures'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import { useFeaturesStore } from '@/stores/featuresStore'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')
vi.mock('@/stores/featuresStore')
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

type AuthState = {
    isDeveloper: boolean
    isAuthenticated: boolean
    isLoading: boolean
}

type GuildState = {
    selectedGuild: { id: string } | null
}

type FeaturesState = {
    globalToggles: Record<string, boolean>
    isLoading: boolean
    loadError: {
        kind: 'auth' | 'forbidden' | 'network' | 'upstream'
        message: string
        scope: 'catalog' | 'global' | 'server'
        status?: number
    } | null
    features: Array<{ name: string; description: string; isGlobal: boolean }>
    clearLoadError: () => void
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
    const updateGlobalToggle = vi.fn<() => Promise<void>>()
    const updateServerToggle = vi.fn<() => Promise<void>>()
    const getServerToggles = vi.fn()
    const clearLoadError = vi.fn()

    let authState: AuthState
    let guildState: GuildState
    let featuresState: FeaturesState

    beforeEach(() => {
        vi.clearAllMocks()
        fetchFeatures.mockResolvedValue()
        fetchGlobalToggles.mockResolvedValue()
        fetchServerToggles.mockResolvedValue()
        updateGlobalToggle.mockResolvedValue()
        updateServerToggle.mockResolvedValue()
        getServerToggles.mockReturnValue({ DOWNLOAD_VIDEO: true })

        authState = {
            isDeveloper: false,
            isAuthenticated: true,
            isLoading: false,
        }
        guildState = {
            selectedGuild: null,
        }
        featuresState = {
            globalToggles: { DOWNLOAD_VIDEO: true },
            isLoading: false,
            loadError: null,
            features: [],
            clearLoadError,
            fetchFeatures,
            fetchGlobalToggles,
            fetchServerToggles,
            updateGlobalToggle,
            updateServerToggle,
            getServerToggles,
        }

        vi.mocked(useAuthStore).mockImplementation(((
            selector: (state: AuthState) => unknown,
        ) => selector(authState)) as typeof useAuthStore)
        vi.mocked(useGuildStore).mockImplementation(((
            selector: (state: GuildState) => unknown,
        ) => selector(guildState)) as typeof useGuildStore)
        vi.mocked(useFeaturesStore).mockImplementation(((
            selector: (state: FeaturesState) => unknown,
        ) => selector(featuresState)) as typeof useFeaturesStore)
    })

    test('does not fetch global toggles for non-developer users', async () => {
        renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).toHaveBeenCalledTimes(1)
        })

        expect(fetchGlobalToggles).not.toHaveBeenCalled()
    })

    test('does not fetch global toggles while auth is loading', async () => {
        authState.isDeveloper = true
        authState.isLoading = true

        renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).not.toHaveBeenCalled()
        })

        expect(fetchGlobalToggles).not.toHaveBeenCalled()
    })

    test('does not fetch global toggles when session is not authenticated', async () => {
        authState.isDeveloper = true
        authState.isAuthenticated = false

        renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).not.toHaveBeenCalled()
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

    test('does not fetch server toggles when no guild is selected', async () => {
        renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).toHaveBeenCalledTimes(1)
        })

        expect(fetchServerToggles).not.toHaveBeenCalled()
    })

    test('returns global toggles when guild is not selected', () => {
        const { result } = renderHook(() => useFeatures())

        expect(result.current.serverToggles).toEqual(
            featuresState.globalToggles,
        )
        expect(getServerToggles).not.toHaveBeenCalled()
    })

    test('returns per-guild toggles when guild is selected', async () => {
        guildState.selectedGuild = { id: 'guild-2' }
        getServerToggles.mockReturnValueOnce({ AUTOPLAY: false })

        const { result } = renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchServerToggles).toHaveBeenCalledWith('guild-2')
        })
        expect(getServerToggles).toHaveBeenCalledWith('guild-2')
        expect(result.current.serverToggles).toEqual({ AUTOPLAY: false })
    })

    test('delegates global toggle updates', () => {
        const { result } = renderHook(() => useFeatures())

        result.current.handleGlobalToggle('AUTOPLAY', false)

        expect(updateGlobalToggle).toHaveBeenCalledWith('AUTOPLAY', false)
    })

    test('delegates server toggle updates only when guild is selected', async () => {
        guildState.selectedGuild = { id: 'guild-3' }
        const { result, rerender } = renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchServerToggles).toHaveBeenCalledWith('guild-3')
        })

        result.current.handleServerToggle('AUTOPLAY', false)
        expect(updateServerToggle).toHaveBeenCalledWith(
            'guild-3',
            'AUTOPLAY',
            false,
        )

        guildState.selectedGuild = null
        rerender()
        result.current.handleServerToggle('AUTOPLAY', true)
        expect(updateServerToggle).toHaveBeenCalledTimes(1)
    })

    test('shows error toast when global toggle update fails', async () => {
        const { toast } = await import('sonner')
        updateGlobalToggle.mockRejectedValue(new Error('API failure'))

        const { result } = renderHook(() => useFeatures())

        await act(async () => {
            result.current.handleGlobalToggle('AUTOPLAY', false)
            await new Promise((r) => setTimeout(r, 10))
        })

        expect(toast.error).toHaveBeenCalledWith(
            'Failed to update global toggle',
        )
    })

    test('shows error toast when server toggle update fails', async () => {
        const { toast } = await import('sonner')
        guildState.selectedGuild = { id: 'guild-5' }
        updateServerToggle.mockRejectedValue(new Error('API failure'))

        const { result } = renderHook(() => useFeatures())

        await act(async () => {
            result.current.handleServerToggle('AUTOPLAY', false)
            await new Promise((r) => setTimeout(r, 10))
        })

        expect(toast.error).toHaveBeenCalledWith(
            'Failed to update server toggle',
        )
    })

    test('retries load with current auth and guild context', async () => {
        authState.isDeveloper = true
        guildState.selectedGuild = { id: 'guild-4' }
        const { result } = renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).toHaveBeenCalledTimes(1)
            expect(fetchGlobalToggles).toHaveBeenCalledTimes(1)
            expect(fetchServerToggles).toHaveBeenCalledWith('guild-4')
        })

        result.current.retryLoad()

        expect(clearLoadError).toHaveBeenCalledTimes(1)
        expect(fetchFeatures).toHaveBeenCalledTimes(2)
        expect(fetchGlobalToggles).toHaveBeenCalledTimes(2)
        expect(fetchServerToggles).toHaveBeenCalledWith('guild-4')
    })
})
