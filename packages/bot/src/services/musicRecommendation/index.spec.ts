import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { RecommendationResult } from './types'
import { MusicRecommendationService } from './index'

const generateRecommendationsMock = jest.fn()
const generateHistoryBasedRecommendationsMock = jest.fn()
const generateUserPreferenceRecommendationsMock = jest.fn()
const trackHistoryGetMock = jest.fn()
const errorLogMock = jest.fn()
const debugLogMock = jest.fn()

jest.mock('./recommendationEngine', () => ({
    generateRecommendations: (...args: unknown[]) =>
        generateRecommendationsMock(...args),
    generateHistoryBasedRecommendations: (...args: unknown[]) =>
        generateHistoryBasedRecommendationsMock(...args),
    generateUserPreferenceRecommendations: (...args: unknown[]) =>
        generateUserPreferenceRecommendationsMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: (...args: unknown[]) => trackHistoryGetMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

describe('MusicRecommendationService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns empty array when current track recommendations reject', async () => {
        const service = new MusicRecommendationService()
        generateRecommendationsMock.mockRejectedValue(new Error('boom'))

        const result = await service.getContextualRecommendations({
            guildId: 'guild-1',
            currentTrack: { id: 'track-1' } as Track,
            recentHistory: [],
            availableTracks: [],
            config: service.getConfig(),
        })

        expect(result).toEqual([])
        expect(generateRecommendationsMock).toHaveBeenCalledTimes(1)
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('uses history recommendations when there is no current track', async () => {
        const service = new MusicRecommendationService()
        const expected: RecommendationResult[] = [
            {
                track: { id: 'recommended-track' } as Track,
                score: 0.92,
                reasons: ['history-match'],
            },
        ]
        generateHistoryBasedRecommendationsMock.mockResolvedValue(expected)

        const result = await service.getContextualRecommendations({
            guildId: 'guild-2',
            recentHistory: [{ id: 'history-track' } as Track],
            availableTracks: [{ id: 'candidate-track' } as Track],
            config: service.getConfig(),
        })

        expect(result).toEqual(expected)
        expect(generateHistoryBasedRecommendationsMock).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when history recommendations reject', async () => {
        const service = new MusicRecommendationService()
        generateHistoryBasedRecommendationsMock.mockRejectedValue(
            new Error('history boom'),
        )

        const result = await service.getContextualRecommendations({
            guildId: 'guild-3',
            recentHistory: [{ id: 'history-track' } as Track],
            availableTracks: [{ id: 'candidate-track' } as Track],
            config: service.getConfig(),
        })

        expect(result).toEqual([])
        expect(errorLogMock).toHaveBeenCalled()
    })

    describe('getRecommendationsBasedOnHistory', () => {
        it('fetches track history with correct guildId and limit', async () => {
            const service = new MusicRecommendationService()
            trackHistoryGetMock.mockResolvedValue([
                {
                    trackId: 'track-1',
                    title: 'Song A',
                    author: 'Artist A',
                    duration: 180,
                },
                {
                    trackId: 'track-2',
                    title: 'Song B',
                    author: 'Artist B',
                    duration: 200,
                },
            ])
            generateUserPreferenceRecommendationsMock.mockResolvedValue([])

            await service.getRecommendationsBasedOnHistory('guild-5', [], 5)

            expect(trackHistoryGetMock).toHaveBeenCalledWith('guild-5', 20)
        })

        it('returns empty array and logs when no history found', async () => {
            const service = new MusicRecommendationService()
            trackHistoryGetMock.mockResolvedValue([])

            const result = await service.getRecommendationsBasedOnHistory(
                'guild-6',
                [],
                5,
            )

            expect(result).toEqual([])
            expect(trackHistoryGetMock).toHaveBeenCalledWith('guild-6', 20)
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'No history found for recommendations',
                    data: expect.objectContaining({ guildId: 'guild-6' }),
                }),
            )
        })

        it('returns empty array and logs error when history fetch fails', async () => {
            const service = new MusicRecommendationService()
            trackHistoryGetMock.mockRejectedValue(new Error('db error'))

            const result = await service.getRecommendationsBasedOnHistory(
                'guild-7',
                [],
                5,
            )

            expect(result).toEqual([])
            expect(errorLogMock).toHaveBeenCalled()
        })
    })
})
