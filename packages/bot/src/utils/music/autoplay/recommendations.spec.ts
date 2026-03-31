import {
    describe,
    test,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import type { Track } from 'discord-player'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: jest.fn(),
    },
    guildSettingsService: {},
}))

import {
    getAutoplayRecommendations,
    updateRecommendationConfig,
    getRecommendationConfig,
} from './recommendations'

describe('autoplay/recommendations', () => {
    let mockGetTrackHistory: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        const { trackHistoryService } = require('@lucky/shared/services')
        mockGetTrackHistory = trackHistoryService.getTrackHistory as jest.Mock

        // Reset recommendation config to defaults
        updateRecommendationConfig({
            maxRecommendations: 8,
            similarityThreshold: 0.4,
            genreWeight: 0.4,
            tagWeight: 0.3,
            artistWeight: 0.2,
            durationWeight: 0.05,
            popularityWeight: 0.05,
            diversityFactor: 0.1,
        })
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    const mockTrack = (id: string): Track =>
        ({
            id,
            title: `Track ${id}`,
            author: 'Artist A',
            duration: 180000,
            url: `https://example.com/${id}`,
            thumbnail: '',
            description: 'Test track',
            views: 1000,
            requestedBy: null,
            source: 'youtube',
            raw: {} as Record<string, unknown>,
            metadata: {},
        }) as unknown as Track

    const mockRecommendationResult = (id: string) => ({
        track: mockTrack(id),
        score: 0.8,
        reasons: ['Similar style'],
    })

    describe('getAutoplayRecommendations', () => {
        test('returns empty array when no current track and no history', async () => {
            mockGetTrackHistory.mockResolvedValue([])

            const result = await getAutoplayRecommendations('guild-1')

            expect(result).toEqual([])
        })

        test('uses history for recommendations when no current track', async () => {
            const historyEntry = {
                url: 'https://example.com/history-1',
                timestamp: Date.now(),
                trackId: 'history-1',
            }
            mockGetTrackHistory.mockResolvedValue([historyEntry])

            const result = await getAutoplayRecommendations('guild-1')

            expect(result).toEqual([])
        })

        test('respects default limit of 5', async () => {
            const currentTrack = mockTrack('current')
            mockGetTrackHistory.mockResolvedValue([])

            await getAutoplayRecommendations('guild-1', currentTrack)

            expect(mockGetTrackHistory).toHaveBeenCalledWith('guild-1', 10)
        })

        test('handles error when track history fetch fails', async () => {
            mockGetTrackHistory.mockRejectedValue(new Error('DB error'))

            const result = await getAutoplayRecommendations('guild-1')

            expect(result).toEqual([])
            expect(errorLogMock).toHaveBeenCalled()
        })

        test('logs debug info when getting recommendations', async () => {
            const currentTrack = mockTrack('current')
            mockGetTrackHistory.mockResolvedValue([])

            await getAutoplayRecommendations('guild-1', currentTrack, 5)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Getting autoplay recommendations',
                    data: expect.objectContaining({
                        guildId: 'guild-1',
                        hasCurrentTrack: true,
                        limit: 5,
                    }),
                }),
            )
        })

        test('logs debug when no current track', async () => {
            mockGetTrackHistory.mockResolvedValue([])

            await getAutoplayRecommendations('guild-1')

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Getting autoplay recommendations',
                    data: expect.objectContaining({
                        guildId: 'guild-1',
                        hasCurrentTrack: false,
                    }),
                }),
            )
        })

        test('fetches 10 items from history', async () => {
            mockGetTrackHistory.mockResolvedValue([])

            await getAutoplayRecommendations('guild-1')

            expect(mockGetTrackHistory).toHaveBeenCalledWith('guild-1', 10)
        })

        test('returns empty when available tracks are empty', async () => {
            const currentTrack = mockTrack('current')
            mockGetTrackHistory.mockResolvedValue([])

            const result = await getAutoplayRecommendations(
                'guild-1',
                currentTrack,
            )

            expect(result).toEqual([])
        })

        test('logs count of generated recommendations as 0', async () => {
            const currentTrack = mockTrack('current')
            mockGetTrackHistory.mockResolvedValue([])

            await getAutoplayRecommendations('guild-1', currentTrack)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Autoplay recommendations generated',
                    data: expect.objectContaining({
                        guildId: 'guild-1',
                        count: 0,
                    }),
                }),
            )
        })

        test('logs error when recommendation service fails', async () => {
            const currentTrack = mockTrack('current')
            mockGetTrackHistory.mockResolvedValue([])

            try {
                await getAutoplayRecommendations('guild-1', currentTrack)
            } catch {
                expect(errorLogMock).toHaveBeenCalled()
            }
        })
    })

    describe('updateRecommendationConfig', () => {
        test('logs the updated configuration', () => {
            const newConfig = { diversityFactor: 0.5 }

            updateRecommendationConfig(newConfig)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Updated recommendation configuration',
                    data: newConfig,
                }),
            )
        })

        test('logs with multiple config properties', () => {
            const newConfig = {
                maxRecommendations: 15,
                similarityThreshold: 0.6,
            }

            updateRecommendationConfig(newConfig)

            expect(debugLogMock).toHaveBeenCalled()
        })
    })

    describe('getRecommendationConfig', () => {
        test('returns current configuration', () => {
            const config = getRecommendationConfig()

            expect(config).toBeDefined()
            expect(config).toHaveProperty('maxRecommendations')
            expect(config).toHaveProperty('similarityThreshold')
        })

        test('returns configuration with all expected properties', () => {
            const config = getRecommendationConfig()

            expect(config.maxRecommendations).toBe(8)
            expect(config.similarityThreshold).toBe(0.4)
            expect(config.genreWeight).toBe(0.4)
            expect(config.tagWeight).toBe(0.3)
            expect(config.artistWeight).toBe(0.2)
        })

        test('includes diversity factor', () => {
            const config = getRecommendationConfig()

            expect(config.diversityFactor).toBe(0.1)
        })

        test('includes artist and source constraints', () => {
            const config = getRecommendationConfig()

            expect(config).toHaveProperty('maxTracksPerArtist')
            expect(config).toHaveProperty('maxTracksPerSource')
        })
    })
})
