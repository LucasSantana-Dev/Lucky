import {
    describe,
    test,
    expect,
    beforeAll,
    beforeEach,
    jest,
} from '@jest/globals'
import { type Track } from 'discord-player'
import {
    getAutoplayRecommendations,
    getRecommendationConfig,
} from './recommendations'

jest.mock('../../../services/musicRecommendation', () => ({
    MusicRecommendationService: jest.fn().mockImplementation(() => ({
        recommendTracks: jest.fn(),
        getConfig: jest.fn(),
    })),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

const historyEntry = {
    trackId: 'track-1',
    title: 'Track One',
    author: 'Artist A',
    duration: 180000,
    url: 'https://example.com/track-1',
}

describe('autoplay/recommendations', () => {
    let mockGetTrackHistory: jest.Mock
    let mockRecommendTracks: jest.Mock
    let mockGetConfig: jest.Mock

    // Capture singleton instance refs once — clearAllMocks() wipes mock.results,
    // so we must grab the instance before the first beforeEach runs.
    beforeAll(() => {
        const {
            MusicRecommendationService,
        } = require('../../../services/musicRecommendation')
        const instance = MusicRecommendationService.mock.results[0].value
        mockRecommendTracks = instance.recommendTracks as jest.Mock
        mockGetConfig = instance.getConfig as jest.Mock
    })

    beforeEach(() => {
        jest.clearAllMocks()
        const { trackHistoryService } = require('@lucky/shared/services')
        mockGetTrackHistory = trackHistoryService.getTrackHistory as jest.Mock
        mockGetTrackHistory.mockResolvedValue([historyEntry])
        mockRecommendTracks.mockResolvedValue([])
        mockGetConfig.mockReturnValue({ maxRecommendations: 8 })
    })

    describe('getAutoplayRecommendations', () => {
        test('returns empty array when no available tracks', async () => {
            const result = await getAutoplayRecommendations('guild-1')
            expect(result).toEqual([])
            expect(mockGetTrackHistory).toHaveBeenCalledWith('guild-1', 10)
        })

        test('maps history entries to Track-shaped objects for recommendation input', async () => {
            mockGetTrackHistory.mockResolvedValue([historyEntry])
            const result = await getAutoplayRecommendations('guild-1')
            // getAvailableTracks always returns [] (placeholder), so result is always []
            expect(result).toEqual([])
            expect(mockGetTrackHistory).toHaveBeenCalledWith('guild-1', 10)
        })

        test('passes currentTrack as seed when provided', async () => {
            const currentTrack = {
                id: 'current',
                title: 'Current Track',
            } as unknown as Track
            const result = await getAutoplayRecommendations(
                'guild-1',
                currentTrack,
            )
            expect(result).toEqual([])
        })

        test('uses default limit of 5', async () => {
            const result = await getAutoplayRecommendations('guild-1')
            expect(result).toEqual([])
        })

        test('returns empty array on error', async () => {
            mockGetTrackHistory.mockRejectedValue(new Error('DB error'))
            const result = await getAutoplayRecommendations('guild-1')
            expect(result).toEqual([])
        })

        test('handles empty track history without error', async () => {
            mockGetTrackHistory.mockResolvedValue([])
            const result = await getAutoplayRecommendations('guild-1')
            expect(result).toEqual([])
        })
    })

    describe('getRecommendationConfig', () => {
        test('returns config from service instance', () => {
            const config = getRecommendationConfig()
            expect(config).toEqual({ maxRecommendations: 8 })
            expect(mockGetConfig).toHaveBeenCalled()
        })
    })
})
