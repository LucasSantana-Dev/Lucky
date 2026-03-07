import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useFeaturesStore } from './featuresStore'

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
            serverToggles: {},
            isLoading: false,
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
            vi.mocked(api.features.list).mockRejectedValue(new Error('fail'))

            await useFeaturesStore.getState().fetchFeatures()

            expect(useFeaturesStore.getState().features).toEqual([])
            expect(useFeaturesStore.getState().isLoading).toBe(false)
        })
    })

    describe('fetchGlobalToggles', () => {
        test('should set global toggles', async () => {
            const toggles = { AUTOPLAY: false, LYRICS: true }
            vi.mocked(api.features.getGlobalToggles).mockResolvedValue({
                data: { toggles },
            } as never)

            await useFeaturesStore.getState().fetchGlobalToggles()

            expect(useFeaturesStore.getState().globalToggles).toEqual(toggles)
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
})
