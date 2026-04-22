import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useFeaturesStore } from './featuresStore'
import { ApiError } from '@/services/ApiError'

vi.mock('@/services/api', () => ({
    api: {
        features: {
            list: vi.fn(),
            getGlobalToggles: vi.fn(),
            getServerToggles: vi.fn(),
            updateGlobalToggle: vi.fn(),
            updateServerToggle: vi.fn(),
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
            serverToggles: {},
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

    describe('fetchServerToggles', () => {
        test('should set per-guild toggles', async () => {
            const toggles = { AUTOPLAY: true }
            vi.mocked(api.features.getServerToggles).mockResolvedValue({
                data: { toggles },
            } as never)

            await useFeaturesStore.getState().fetchServerToggles('guild-1')

            expect(
                useFeaturesStore.getState().serverToggles['guild-1'],
            ).toEqual(toggles)
        })

        test('should set defaults on error for new guild', async () => {
            vi.mocked(api.features.getServerToggles).mockRejectedValue(
                new Error('fail'),
            )

            await useFeaturesStore.getState().fetchServerToggles('guild-2')

            const toggles = useFeaturesStore.getState().serverToggles['guild-2']
            expect(toggles).toBeDefined()
            expect(toggles.AUTOPLAY).toBe(true)
            expect(useFeaturesStore.getState().loadError).toEqual({
                kind: 'upstream',
                message: 'fail',
                scope: 'server',
            })
        })

        test('classifies network failures for server toggles', async () => {
            vi.mocked(api.features.getServerToggles).mockRejectedValue(
                new ApiError(0, 'offline'),
            )

            await useFeaturesStore.getState().fetchServerToggles('guild-9')

            expect(useFeaturesStore.getState().loadError).toEqual({
                kind: 'network',
                message: 'offline',
                status: 0,
                scope: 'server',
            })
        })

        test('should keep existing toggles on error', async () => {
            useFeaturesStore.setState({
                serverToggles: {
                    'guild-3': { AUTOPLAY: false } as never,
                },
            })
            vi.mocked(api.features.getServerToggles).mockRejectedValue(
                new Error('fail'),
            )

            await useFeaturesStore.getState().fetchServerToggles('guild-3')

            expect(
                useFeaturesStore.getState().serverToggles['guild-3'].AUTOPLAY,
            ).toBe(false)
            expect(useFeaturesStore.getState().loadError).toEqual({
                kind: 'upstream',
                message: 'fail',
                scope: 'server',
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
    })

    describe('updateServerToggle', () => {
        test('should update server toggle on success', async () => {
            vi.mocked(api.features.updateServerToggle).mockResolvedValue(
                undefined as never,
            )

            await useFeaturesStore
                .getState()
                .updateServerToggle('guild-1', 'LYRICS', false)

            expect(
                useFeaturesStore.getState().serverToggles['guild-1'].LYRICS,
            ).toBe(false)
        })
    })

    describe('getServerToggles', () => {
        test('should return defaults for unknown guild', () => {
            const toggles = useFeaturesStore
                .getState()
                .getServerToggles('unknown')
            expect(toggles.AUTOPLAY).toBe(true)
            expect(toggles.LYRICS).toBe(true)
        })
    })

    describe('clearLoadError', () => {
        test('resets loadError to null', () => {
            useFeaturesStore.setState({
                loadError: {
                    kind: 'network',
                    message: 'offline',
                    scope: 'server',
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
