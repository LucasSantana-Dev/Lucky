import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useFeaturesStore } from './featuresStore'
import { ApiError } from '@/services/ApiError'

vi.mock('@/services/api', () => ({
    api: {
        features: {
            list: vi.fn(),
            getGlobalToggles: vi.fn(),
            updateGlobalToggle: vi.fn(),
        },
    },
}))

import { api } from '@/services/api'

describe('featuresStore', () => {
    beforeEach(() => {
        useFeaturesStore.setState({
            features: [],
            globalToggles: {} as never,
            globalToggleProvider: 'environment',
            globalTogglesWritable: false,
            isLoading: false,
            loadError: null,
        })
        vi.clearAllMocks()
    })

    describe('fetchFeatures', () => {
        test('should fetch and set features', async () => {
            vi.mocked(api.features.list).mockResolvedValue({
                data: {
                    features: [{ name: 'AUTOPLAY', description: 'Auto play' }],
                },
            } as never)

            await useFeaturesStore.getState().fetchFeatures()

            expect(useFeaturesStore.getState().features).toHaveLength(1)
            expect(useFeaturesStore.getState().features[0].isGlobal).toBe(false)
            expect(useFeaturesStore.getState().isLoading).toBe(false)
        })

        test('should reset on error', async () => {
            vi.mocked(api.features.list).mockRejectedValue(
                new ApiError(502, 'upstream unavailable'),
            )

            await useFeaturesStore.getState().fetchFeatures()

            expect(useFeaturesStore.getState().features).toEqual([])
            expect(useFeaturesStore.getState().isLoading).toBe(false)
            expect(useFeaturesStore.getState().loadError).toEqual({
                kind: 'upstream',
                message: 'upstream unavailable',
                scope: 'catalog',
                status: 502,
            })
        })
    })

    describe('fetchGlobalToggles', () => {
        test('should set global toggles', async () => {
            const toggles = { AUTOPLAY: false, LYRICS: true }
            vi.mocked(api.features.getGlobalToggles).mockResolvedValue({
                data: {
                    toggles,
                    provider: 'vercel',
                    writable: false,
                },
            } as never)

            await useFeaturesStore.getState().fetchGlobalToggles()

            expect(useFeaturesStore.getState().globalToggles).toEqual(toggles)
            expect(useFeaturesStore.getState().globalToggleProvider).toBe(
                'vercel',
            )
            expect(useFeaturesStore.getState().globalTogglesWritable).toBe(
                false,
            )
            expect(useFeaturesStore.getState().loadError).toBeNull()
        })

        test('classifies auth failures for global toggles', async () => {
            vi.mocked(api.features.getGlobalToggles).mockRejectedValue(
                new ApiError(401, 'Session expired'),
            )

            await useFeaturesStore.getState().fetchGlobalToggles()

            expect(useFeaturesStore.getState().loadError).toEqual({
                kind: 'auth',
                message: 'Session expired',
                status: 401,
                scope: 'global',
            })
        })

        test('classifies forbidden failures for global toggles', async () => {
            vi.mocked(api.features.getGlobalToggles).mockRejectedValue(
                new ApiError(403, 'Access denied'),
            )

            await useFeaturesStore.getState().fetchGlobalToggles()

            expect(useFeaturesStore.getState().loadError).toEqual({
                kind: 'forbidden',
                message: 'Access denied',
                status: 403,
                scope: 'global',
            })
        })
    })

    describe('updateGlobalToggle', () => {
        test('should update toggle optimistically on success', async () => {
            vi.mocked(api.features.updateGlobalToggle).mockResolvedValue(
                undefined as never,
            )

            await useFeaturesStore
                .getState()
                .updateGlobalToggle('AUTOPLAY', false)

            expect(useFeaturesStore.getState().globalToggles.AUTOPLAY).toBe(
                false,
            )
        })

        test('should rollback toggle on API failure', async () => {
            // Set initial state
            useFeaturesStore.setState({
                globalToggles: { AUTOPLAY: true } as never,
            })

            vi.mocked(api.features.updateGlobalToggle).mockRejectedValue(
                new ApiError(500, 'Server error'),
            )

            await expect(
                useFeaturesStore
                    .getState()
                    .updateGlobalToggle('AUTOPLAY', false),
            ).rejects.toThrow()

            // Should be rolled back to original value
            expect(useFeaturesStore.getState().globalToggles.AUTOPLAY).toBe(
                true,
            )
        })
    })

    describe('clearLoadError', () => {
        test('resets loadError to null', () => {
            useFeaturesStore.setState({
                loadError: {
                    kind: 'network',
                    message: 'offline',
                    scope: 'global',
                    status: 0,
                },
            })

            useFeaturesStore.getState().clearLoadError()

            expect(useFeaturesStore.getState().loadError).toBeNull()
        })
    })

    describe('error classification fallback', () => {
        test('uses generic upstream message for unknown errors', async () => {
            vi.mocked(api.features.list).mockRejectedValue('unparseable error')

            await useFeaturesStore.getState().fetchFeatures()

            expect(useFeaturesStore.getState().loadError).toEqual({
                kind: 'upstream',
                message: 'Feature data is currently unavailable',
                scope: 'catalog',
            })
        })
    })
})
