import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { RecommendationResult } from './types'
import { MusicRecommendationService } from './index'

const generateRecommendationsMock = jest.fn()
const generateHistoryBasedRecommendationsMock = jest.fn()
const generateUserPreferenceRecommendationsMock = jest.fn()
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

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

describe('MusicRecommendationService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('recommendTracks', () => {
        it('uses seed track when strategy is auto and seed tracks available', async () => {
            const service = new MusicRecommendationService()
            const expected: RecommendationResult[] = [
                {
                    track: { id: 'recommended-track' } as Track,
                    score: 0.92,
                    reasons: ['seed-match'],
                },
            ]
            generateRecommendationsMock.mockResolvedValue(expected)

            const result = await service.recommendTracks({
                guildId: 'guild-1',
                seedTracks: [{ id: 'seed-track' } as Track],
                trackHistory: [],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'auto',
                limit: 5,
            })

            expect(result).toEqual(expected)
            expect(generateRecommendationsMock).toHaveBeenCalledTimes(1)
        })

        it('falls back to history when strategy is auto and no seed tracks', async () => {
            const service = new MusicRecommendationService()
            const expected: RecommendationResult[] = [
                {
                    track: { id: 'recommended-track' } as Track,
                    score: 0.85,
                    reasons: ['history-match'],
                },
            ]
            generateHistoryBasedRecommendationsMock.mockResolvedValue(expected)

            const result = await service.recommendTracks({
                guildId: 'guild-2',
                seedTracks: [],
                trackHistory: [{ id: 'history-track' } as Track],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'auto',
                limit: 5,
            })

            expect(result).toEqual(expected)
            expect(
                generateHistoryBasedRecommendationsMock,
            ).toHaveBeenCalledTimes(1)
        })

        it('returns empty array when auto strategy has no seed or history', async () => {
            const service = new MusicRecommendationService()

            const result = await service.recommendTracks({
                guildId: 'guild-3',
                seedTracks: [],
                trackHistory: [],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'auto',
                limit: 5,
            })

            expect(result).toEqual([])
        })

        it('uses preference strategy when requested with userPreferences', async () => {
            const service = new MusicRecommendationService()
            const expected: RecommendationResult[] = [
                {
                    track: { id: 'recommended-track' } as Track,
                    score: 0.88,
                    reasons: ['preference-match'],
                },
            ]
            generateUserPreferenceRecommendationsMock.mockResolvedValue(
                expected,
            )

            const result = await service.recommendTracks({
                guildId: 'guild-4',
                seedTracks: [],
                trackHistory: [],
                availableTracks: [{ id: 'candidate-track' } as Track],
                userPreferences: {
                    genres: ['rock', 'indie'],
                    artists: ['artist1', 'artist2'],
                    avgDuration: 180,
                },
                strategy: 'preference',
                limit: 5,
            })

            expect(result).toEqual(expected)
            expect(
                generateUserPreferenceRecommendationsMock,
            ).toHaveBeenCalledTimes(1)
        })

        it('returns empty array when preference strategy requested but no userPreferences', async () => {
            const service = new MusicRecommendationService()

            const result = await service.recommendTracks({
                guildId: 'guild-5',
                seedTracks: [],
                trackHistory: [],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'preference',
                limit: 5,
            })

            expect(result).toEqual([])
            expect(
                generateUserPreferenceRecommendationsMock,
            ).not.toHaveBeenCalled()
        })

        it('uses history strategy when requested', async () => {
            const service = new MusicRecommendationService()
            const expected: RecommendationResult[] = [
                {
                    track: { id: 'recommended-track' } as Track,
                    score: 0.8,
                    reasons: ['history-match'],
                },
            ]
            generateHistoryBasedRecommendationsMock.mockResolvedValue(expected)

            const result = await service.recommendTracks({
                guildId: 'guild-6',
                seedTracks: [{ id: 'seed-track' } as Track],
                trackHistory: [{ id: 'history-track' } as Track],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'history',
                limit: 5,
            })

            expect(result).toEqual(expected)
            expect(
                generateHistoryBasedRecommendationsMock,
            ).toHaveBeenCalledTimes(1)
        })

        it('respects limit parameter by slicing results', async () => {
            const service = new MusicRecommendationService()
            const results: RecommendationResult[] = [
                { track: { id: 'track1' } as Track, score: 0.9, reasons: [] },
                { track: { id: 'track2' } as Track, score: 0.85, reasons: [] },
                { track: { id: 'track3' } as Track, score: 0.8, reasons: [] },
            ]
            generateHistoryBasedRecommendationsMock.mockResolvedValue(results)

            const result = await service.recommendTracks({
                guildId: 'guild-7',
                seedTracks: [],
                trackHistory: [{ id: 'history-track' } as Track],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'history',
                limit: 2,
            })

            expect(result).toHaveLength(2)
            expect(result).toEqual(results.slice(0, 2))
        })

        it('returns empty array and logs error when recommendations reject', async () => {
            const service = new MusicRecommendationService()
            generateHistoryBasedRecommendationsMock.mockRejectedValue(
                new Error('engine error'),
            )

            const result = await service.recommendTracks({
                guildId: 'guild-8',
                seedTracks: [],
                trackHistory: [{ id: 'history-track' } as Track],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'history',
                limit: 5,
            })

            expect(result).toEqual([])
            expect(errorLogMock).toHaveBeenCalled()
        })

        it('excludes recent track IDs from all strategies', async () => {
            const service = new MusicRecommendationService()
            const expected: RecommendationResult[] = [
                {
                    track: { id: 'new-track' } as Track,
                    score: 0.9,
                    reasons: [],
                },
            ]
            generateHistoryBasedRecommendationsMock.mockResolvedValue(expected)

            await service.recommendTracks({
                guildId: 'guild-10',
                seedTracks: [],
                trackHistory: [
                    { id: 'recent1' } as Track,
                    { id: 'recent2' } as Track,
                    { id: 'recent3' } as Track,
                    { id: 'recent4' } as Track,
                    { id: 'recent5' } as Track,
                ],
                availableTracks: [{ id: 'candidate-track' } as Track],
                strategy: 'history',
                limit: 5,
            })

            const call = generateHistoryBasedRecommendationsMock.mock.calls[0]
            const excludeIdsArg = call[3]
            expect(excludeIdsArg).toEqual([
                'recent1',
                'recent2',
                'recent3',
                'recent4',
                'recent5',
            ])
        })
    })

    describe('getConfig', () => {
        it('returns a copy of the config', () => {
            const service = new MusicRecommendationService({
                maxRecommendations: 15,
            })
            const config = service.getConfig()

            expect(config.maxRecommendations).toBe(15)
            expect(config).not.toBe(service)
        })
    })
})
