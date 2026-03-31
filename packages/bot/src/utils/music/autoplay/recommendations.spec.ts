import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track } from 'discord-player'
import {
    getAutoplayRecommendations,
    updateRecommendationConfig,
    getRecommendationConfig,
} from './recommendations'

const getTrackHistoryMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

const getPersonalizedRecommendationsMock = jest.fn()
const getRecommendationsBasedOnHistoryMock = jest.fn()
const updateConfigMock = jest.fn()
const getConfigMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: (...args: unknown[]) => getTrackHistoryMock(...args),
    },
}))

jest.mock('../../../services/musicRecommendation', () => ({
    MusicRecommendationService: jest.fn(() => ({
        getPersonalizedRecommendations: (...args: unknown[]) =>
            getPersonalizedRecommendationsMock(...args),
        getRecommendationsBasedOnHistory: (...args: unknown[]) =>
            getRecommendationsBasedOnHistoryMock(...args),
        updateConfig: (...args: unknown[]) => updateConfigMock(...args),
        getConfig: (...args: unknown[]) => getConfigMock(...args),
    })),
}))

const mockConfig = {
    maxRecommendations: 8,
    similarityThreshold: 0.4,
    genreWeight: 0.4,
    tagWeight: 0.3,
    artistWeight: 0.2,
    durationWeight: 0.05,
    popularityWeight: 0.05,
    diversityFactor: 0.1,
    maxTracksPerArtist: 2,
    maxTracksPerSource: 3,
}

describe('getAutoplayRecommendations', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('logs getting autoplay recommendations', async () => {
        getTrackHistoryMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-1')

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Getting autoplay recommendations',
                data: expect.objectContaining({ guildId: 'guild-1' }),
            }),
        )
    })

    it('fetches recent track history', async () => {
        getTrackHistoryMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-2')

        expect(getTrackHistoryMock).toHaveBeenCalledWith('guild-2', 10)
    })

    it('attempts to get personalized recommendations when current track provided', async () => {
        const currentTrack = {
            id: 'current-1',
            title: 'Current Song',
            author: 'Current Artist',
        } as Track

        getTrackHistoryMock.mockResolvedValue([])
        getPersonalizedRecommendationsMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-3', currentTrack, 5)

        expect(getTrackHistoryMock).toHaveBeenCalledWith('guild-3', 10)
    })

    it('uses history when no current track provided', async () => {
        const historyEntry = {
            url: 'history-url',
            title: 'Past Song',
            author: 'Past Artist',
        }

        getTrackHistoryMock.mockResolvedValue([historyEntry])
        getRecommendationsBasedOnHistoryMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-4')

        expect(getTrackHistoryMock).toHaveBeenCalledWith('guild-4', 10)
    })

    it('passes limit to debug logging', async () => {
        getTrackHistoryMock.mockResolvedValue([])
        getRecommendationsBasedOnHistoryMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-5', undefined, 10)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ limit: 10 }),
            }),
        )
    })

    it('defaults to limit of 5 when not provided', async () => {
        getTrackHistoryMock.mockResolvedValue([])
        getRecommendationsBasedOnHistoryMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-6')

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Getting autoplay recommendations',
                data: expect.objectContaining({ limit: 5 }),
            }),
        )
    })

    it('returns empty array when no available tracks', async () => {
        const currentTrack = { id: 'current-1' } as Track
        getTrackHistoryMock.mockResolvedValue([])
        getPersonalizedRecommendationsMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        const result = await getAutoplayRecommendations('guild-7', currentTrack)

        expect(result).toEqual([])
    })

    it('logs generated recommendations count', async () => {
        const currentTrack = { id: 'current-1' } as Track
        const recTrack = {
            id: 'rec-1',
            title: 'Song',
            author: 'Artist',
        } as Track

        getTrackHistoryMock.mockResolvedValue([])
        getPersonalizedRecommendationsMock.mockResolvedValue([
            { track: recTrack, score: 0.8, reasons: [] },
        ])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-8', currentTrack)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Autoplay recommendations generated',
            }),
        )
    })

    it('returns empty array on error', async () => {
        getTrackHistoryMock.mockRejectedValue(new Error('history error'))
        getConfigMock.mockReturnValue(mockConfig)

        const result = await getAutoplayRecommendations('guild-9')

        expect(result).toEqual([])
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('logs when current track is provided', async () => {
        const currentTrack = { id: 'current-1', title: 'Current' } as Track

        getTrackHistoryMock.mockResolvedValue([])
        getPersonalizedRecommendationsMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        await getAutoplayRecommendations('guild-10', currentTrack)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ hasCurrentTrack: true }),
            }),
        )
    })

    it('returns empty array when no available tracks found', async () => {
        const currentTrack = { id: 'current-1' } as Track

        getTrackHistoryMock.mockResolvedValue([])
        getConfigMock.mockReturnValue(mockConfig)

        const result = await getAutoplayRecommendations(
            'guild-11',
            currentTrack,
        )

        expect(result).toEqual([])
    })
})

describe('updateRecommendationConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('calls service updateConfig with provided config', () => {
        const newConfig = { diversityFactor: 0.5 }

        updateRecommendationConfig(newConfig)

        expect(updateConfigMock).toHaveBeenCalledWith(newConfig)
    })

    it('logs debug message when updating config', () => {
        const newConfig = { maxRecommendations: 15 }

        updateRecommendationConfig(newConfig)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Updated recommendation configuration',
                data: newConfig,
            }),
        )
    })

    it('handles partial config updates', () => {
        const partialConfig = { similarityThreshold: 0.5 }

        updateRecommendationConfig(partialConfig)

        expect(updateConfigMock).toHaveBeenCalledWith(partialConfig)
    })

    it('handles full config replacement', () => {
        const fullConfig = {
            maxRecommendations: 20,
            similarityThreshold: 0.5,
            genreWeight: 0.5,
            tagWeight: 0.25,
            artistWeight: 0.15,
            durationWeight: 0.05,
            popularityWeight: 0.05,
            diversityFactor: 0.2,
            maxTracksPerArtist: 3,
            maxTracksPerSource: 4,
        }

        updateRecommendationConfig(fullConfig)

        expect(updateConfigMock).toHaveBeenCalledWith(fullConfig)
    })
})

describe('getRecommendationConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns config from service', () => {
        getConfigMock.mockReturnValue(mockConfig)

        const result = getRecommendationConfig()

        expect(result).toEqual(mockConfig)
        expect(getConfigMock).toHaveBeenCalled()
    })

    it('returns current config values', () => {
        const customConfig = {
            ...mockConfig,
            maxRecommendations: 15,
            diversityFactor: 0.6,
        }
        getConfigMock.mockReturnValue(customConfig)

        const result = getRecommendationConfig()

        expect(result.maxRecommendations).toBe(15)
        expect(result.diversityFactor).toBe(0.6)
    })
})
