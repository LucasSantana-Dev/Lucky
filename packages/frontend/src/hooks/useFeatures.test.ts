import { beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useFeatures } from './useFeatures'
import { useAuthStore } from '@/stores/authStore'
import { useFeaturesStore } from '@/stores/featuresStore'

vi.mock('@/stores/authStore')
vi.mock('@/stores/featuresStore')
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

type AuthState = {
    isDeveloper: boolean
    isAuthenticated: boolean
    isLoading: boolean
}

type FeaturesState = {
    globalToggles: Record<string, boolean>
    globalToggleProvider: 'database' | 'environment'
    globalTogglesWritable: boolean
    isLoading: boolean
    loadError: {
        kind: 'auth' | 'forbidden' | 'network' | 'upstream'
        message: string
        scope: 'catalog' | 'global'
        status?: number
    } | null
    features: Array<{ name: string; description: string; isGlobal: boolean }>
    clearLoadError: () => void
    fetchFeatures: () => Promise<void>
    fetchGlobalToggles: () => Promise<void>
    updateGlobalToggle: (name: string, enabled: boolean) => Promise<void>
}

describe('useFeatures', () => {
    const fetchFeatures = vi.fn<() => Promise<void>>()
    const fetchGlobalToggles = vi.fn<() => Promise<void>>()
    const updateGlobalToggle = vi.fn<() => Promise<void>>()
    const clearLoadError = vi.fn()

    let authState: AuthState
    let featuresState: FeaturesState

    beforeEach(() => {
        vi.clearAllMocks()
        fetchFeatures.mockResolvedValue()
        fetchGlobalToggles.mockResolvedValue()
        updateGlobalToggle.mockResolvedValue()

        authState = {
            isDeveloper: false,
            isAuthenticated: true,
            isLoading: false,
        }
        featuresState = {
            globalToggles: { DOWNLOAD_VIDEO: true },
            globalToggleProvider: 'database',
            globalTogglesWritable: false,
            isLoading: false,
            loadError: null,
            features: [],
            clearLoadError,
            fetchFeatures,
            fetchGlobalToggles,
            updateGlobalToggle,
        }

        vi.mocked(useAuthStore).mockImplementation(((
            selector: (state: AuthState) => unknown,
        ) => selector(authState)) as typeof useAuthStore)
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

    test('delegates global toggle updates', () => {
        const { result } = renderHook(() => useFeatures())

        result.current.handleGlobalToggle('AUTOPLAY', false)

        expect(updateGlobalToggle).toHaveBeenCalledWith('AUTOPLAY', false)
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

    test('retries load with current auth and guild context', async () => {
        authState.isDeveloper = true
        const { result } = renderHook(() => useFeatures())

        await waitFor(() => {
            expect(fetchFeatures).toHaveBeenCalledTimes(1)
            expect(fetchGlobalToggles).toHaveBeenCalledTimes(1)
        })

        result.current.retryLoad()

        expect(clearLoadError).toHaveBeenCalledTimes(1)
        expect(fetchFeatures).toHaveBeenCalledTimes(2)
        expect(fetchGlobalToggles).toHaveBeenCalledTimes(2)
    })
})
