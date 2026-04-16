import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { collectLastFmCandidates } from './lastFmSeeder'
import * as lastFmSeeds from './lastFmSeeds'
import * as lastfm from '../../lastfm'
import * as searchQueryCleaner from '../searchQueryCleaner'
import * as candidateScorer from './candidateScorer'
import * as queueManipulation from '../queueManipulation'
import type { QueueMetadata } from '../../../types/QueueMetadata'

jest.mock('./lastFmSeeds')
jest.mock('../../../lastfm')
jest.mock('../searchQueryCleaner')
jest.mock('./candidateScorer')
jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: jest.fn(),
    },
}))

describe('lastFmSeeder', () => {
    const mockQueue = {
        metadata: { vcMemberIds: [] } as QueueMetadata,
        player: {
            search: jest.fn(),
        },
    } as unknown as GuildQueue

    const mockRequestedBy = { id: 'user-123' } as User

    const mockTrack = {
        url: 'https://spotify.com/track/123',
        title: 'Song Title',
        author: 'Artist Name',
        durationMS: 180000,
    } as unknown as Track

    const mockCurrentTrack = {
        url: 'https://spotify.com/track/current',
        title: 'Current Song',
        author: 'Current Artist',
        durationMS: 200000,
    } as unknown as Track

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should return early if seedSlice is empty', async () => {
        ;(lastFmSeeds.consumeLastFmSeedSlice as jest.Mock).mockResolvedValueOnce(
            []
        )

        const candidates = new Map()
        await collectLastFmCandidates(
            mockQueue,
            mockRequestedBy,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack,
            new Set(),
            candidates,
        )

        expect(candidates.size).toBe(0)
    })

    it('should use consumeLastFmSeedSlice for single user', async () => {
        const seedSlice = [{ artist: 'Artist A', title: 'Song A' }]
        ;(lastFmSeeds.consumeLastFmSeedSlice as jest.Mock).mockResolvedValueOnce(
            seedSlice
        )
        ;(searchQueryCleaner.cleanSearchQuery as jest.Mock).mockReturnValue(
            'query'
        )
        ;(lastfm.getSimilarTracks as jest.Mock).mockResolvedValueOnce([])
        ;(mockQueue.player.search as jest.Mock).mockResolvedValueOnce({
            tracks: [mockTrack],
        } as any)

        const shouldIncludeCandidate = jest
            .spyOn(queueManipulation, 'shouldIncludeCandidate')
            .mockReturnValue(true)
        const calculateScore = jest
            .spyOn(candidateScorer, 'calculateRecommendationScore')
            .mockReturnValue({ score: 0.8, reason: 'test' })
        const upsertCandidate = jest
            .spyOn(queueManipulation, 'upsertScoredCandidate')
            .mockImplementation((candidates, track, update) => {
                const url = track.url || ''
                candidates.set(url, { track, ...update })
            })

        const candidates = new Map()
        await collectLastFmCandidates(
            mockQueue,
            mockRequestedBy,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack,
            new Set(),
            candidates,
        )

        expect(
            lastFmSeeds.consumeLastFmSeedSlice as jest.Mock
        ).toHaveBeenCalledWith('user-123', 3)
        expect(candidates.size).toBeGreaterThan(0)

        shouldIncludeCandidate.mockRestore()
        calculateScore.mockRestore()
        upsertCandidate.mockRestore()
    })

    it('should handle empty search results gracefully', async () => {
        const seedSlice = [{ artist: 'Artist A', title: 'Song A' }]
        ;(lastFmSeeds.consumeLastFmSeedSlice as jest.Mock).mockResolvedValueOnce(
            seedSlice
        )
        ;(searchQueryCleaner.cleanSearchQuery as jest.Mock).mockReturnValue(
            'query'
        )
        ;(lastfm.getSimilarTracks as jest.Mock).mockResolvedValueOnce([])
        ;(mockQueue.player.search as jest.Mock).mockResolvedValueOnce({
            tracks: [],
        } as any)

        const candidates = new Map()
        await collectLastFmCandidates(
            mockQueue,
            mockRequestedBy,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack,
            new Set(),
            candidates,
        )

        expect(candidates.size).toBe(0)
    })

    it('should apply score multiplier for similar tracks', async () => {
        const seedSlice = [{ artist: 'Artist A', title: 'Song A' }]
        ;(lastFmSeeds.consumeLastFmSeedSlice as jest.Mock).mockResolvedValueOnce(
            seedSlice
        )
        ;(searchQueryCleaner.cleanSearchQuery as jest.Mock).mockReturnValue(
            'query'
        )
        ;(searchQueryCleaner.cleanTitle as jest.Mock).mockReturnValue('cleaned')
        ;(lastfm.getSimilarTracks as jest.Mock).mockResolvedValueOnce([
            { artist: 'Similar Artist', title: 'Similar Song', match: 85 },
        ])
        ;(mockQueue.player.search as jest.Mock).mockResolvedValue({
            tracks: [mockTrack],
        } as any)

        const upsertCandidate = jest
            .spyOn(queueManipulation, 'upsertScoredCandidate')
            .mockImplementation((candidates, track, update) => {
                const url = track.url || ''
                candidates.set(url, { track, ...update })
            })
        const shouldIncludeCandidate = jest
            .spyOn(queueManipulation, 'shouldIncludeCandidate')
            .mockReturnValue(true)
        const calculateScore = jest
            .spyOn(candidateScorer, 'calculateRecommendationScore')
            .mockReturnValue({ score: 1.0, reason: 'similar' })

        const candidates = new Map()
        await collectLastFmCandidates(
            mockQueue,
            mockRequestedBy,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack,
            new Set(),
            candidates,
        )

        expect(lastfm.getSimilarTracks as jest.Mock).toHaveBeenCalled()
        expect(upsertCandidate).toHaveBeenCalled()

        upsertCandidate.mockRestore()
        shouldIncludeCandidate.mockRestore()
        calculateScore.mockRestore()
    })

    it('should handle search engine fallback on error', async () => {
        const seedSlice = [{ artist: 'Artist A', title: 'Song A' }]
        ;(lastFmSeeds.consumeLastFmSeedSlice as jest.Mock).mockResolvedValueOnce(
            seedSlice
        )
        ;(searchQueryCleaner.cleanSearchQuery as jest.Mock).mockReturnValue(
            'query'
        )
        ;(lastfm.getSimilarTracks as jest.Mock).mockResolvedValueOnce([])

        ;(mockQueue.player.search as jest.Mock)
            .mockRejectedValueOnce(new Error('Spotify failed'))
            .mockRejectedValueOnce(new Error('YouTube failed'))
            .mockResolvedValueOnce({ tracks: [mockTrack] } as any)

        const shouldIncludeCandidate = jest
            .spyOn(queueManipulation, 'shouldIncludeCandidate')
            .mockReturnValue(true)
        const calculateScore = jest
            .spyOn(candidateScorer, 'calculateRecommendationScore')
            .mockReturnValue({ score: 0.5, reason: 'fallback' })
        const upsertCandidate = jest
            .spyOn(queueManipulation, 'upsertScoredCandidate')
            .mockImplementation((candidates, track, update) => {
                const url = track.url || ''
                candidates.set(url, { track, ...update })
            })

        const candidates = new Map()
        await collectLastFmCandidates(
            mockQueue,
            mockRequestedBy,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack,
            new Set(),
            candidates,
        )

        expect(mockQueue.player.search as jest.Mock).toHaveBeenCalledTimes(3)
        expect(candidates.size).toBeGreaterThan(0)

        shouldIncludeCandidate.mockRestore()
        calculateScore.mockRestore()
        upsertCandidate.mockRestore()
    })

    it('should respect excludedUrls', async () => {
        const seedSlice = [{ artist: 'Artist A', title: 'Song A' }]
        ;(lastFmSeeds.consumeLastFmSeedSlice as jest.Mock).mockResolvedValueOnce(
            seedSlice
        )
        ;(searchQueryCleaner.cleanSearchQuery as jest.Mock).mockReturnValue(
            'query'
        )
        ;(lastfm.getSimilarTracks as jest.Mock).mockResolvedValueOnce([])
        ;(mockQueue.player.search as jest.Mock).mockResolvedValueOnce({
            tracks: [mockTrack],
        } as any)

        const shouldIncludeCandidate = jest
            .spyOn(queueManipulation, 'shouldIncludeCandidate')
            .mockReturnValue(false)

        const candidates = new Map()
        await collectLastFmCandidates(
            mockQueue,
            mockRequestedBy,
            new Set(['https://spotify.com/track/123']),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack,
            new Set(),
            candidates,
        )

        expect(candidates.size).toBe(0)
        shouldIncludeCandidate.mockRestore()
    })
})
