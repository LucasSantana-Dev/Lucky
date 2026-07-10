import { jest } from '@jest/globals'

jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getAutoplaySkipRateForGuild: jest.fn(),
}))
import {
    shuffleQueue,
    smartShuffleQueue,
    removeTrackFromQueue,
    moveTrackInQueue,
    rescueQueue,
} from './queueManipulation'

jest.mock('lru-cache', () => ({
    LRUCache: jest.fn(function () {
        this.get = jest.fn().mockReturnValue(null)
        this.set = jest.fn()
        this.delete = jest.fn()
        this.clear = jest.fn()
    }),
}))

jest.mock('discord-player', () => ({
    QueryType: {
        AUTO: 'auto',
        YOUTUBE_SEARCH: 'youtubeSearch',
        SPOTIFY_SEARCH: 'spotifySearch',
    },
    QueueRepeatMode: {
        OFF: 0,
        TRACK: 1,
        QUEUE: 2,
        AUTOPLAY: 3,
    },
}))

type GuildQueue = any
type Track = any

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: jest.fn(),
        addTrackToHistory: jest.fn().mockResolvedValue(true),
        getReplayFrequentTracks: jest.fn(),
    },
    guildSettingsService: {
        getGuildSettings: jest.fn(),
    },
    lastFmLinkService: {
        getByDiscordId: jest.fn(),
    },
    spotifyLinkService: {
        getValidAccessToken: jest.fn().mockResolvedValue(null),
        getByDiscordId: jest.fn().mockResolvedValue(null),
    },
    premiumService: {
        isPremium: jest.fn(() => Promise.resolve(false)),
    },
}))

jest.mock('./autoplay/lastFmSeeds', () => ({
    LASTFM_SEED_COUNT: 15,
    consumeLastFmSeedSlice: jest.fn(),
    consumeBlendedSeedSlice: jest.fn(),
    isLovedSeed: jest.fn().mockReturnValue(false),
}))

jest.mock('../../lastfm', () => ({
    getSimilarTracks: jest.fn(),
    getTagTopTracks: jest.fn(),
    getArtistTopTags: jest.fn(),
}))

jest.mock('../../spotify/spotifyApi', () => ({
    getAudioFeatures: jest.fn().mockResolvedValue(null),
    searchSpotifyTrack: jest.fn().mockResolvedValue(null),
    getBatchAudioFeatures: jest.fn().mockResolvedValue(new Map()),
    getArtistPopularity: jest.fn().mockResolvedValue(null),
    getArtistGenres: jest.fn().mockResolvedValue([]),
    getSpotifyRecommendations: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../spotify/spotifyUserSeeds', () => ({
    getUserSpotifySeeds: jest.fn(),
}))

jest.mock('../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        getLikedTrackWeights: jest.fn(),
        getDislikedTrackWeights: jest.fn(),
        getPreferredArtistKeys: jest.fn(),
        getBlockedArtistKeys: jest.fn(),
        getImplicitDislikeKeys: jest.fn(),
        getImplicitLikeKeys: jest.fn(),
        getGuildImplicitDislikeKeys: jest.fn(),
    },
}))

describe('queueManipulation.queueOperations', () => {
    it('shuffles queue tracks and keeps all items', async () => {
        const trackA = { id: '1', title: 'A', author: 'Artist A' } as Track
        const trackB = { id: '2', title: 'B', author: 'Artist B' } as Track
        const trackC = { id: '3', title: 'C', author: 'Artist C' } as Track
        const queue = {
            tracks: {
                toArray: jest.fn().mockReturnValue([trackA, trackB, trackC]),
            },
            clear: jest.fn(),
            addTrack: jest.fn(),
        } as unknown as GuildQueue

        const result = await shuffleQueue(queue)

        expect(result).toBe(true)
        expect((queue as any).clear).toHaveBeenCalled()
        expect((queue as any).addTrack).toHaveBeenCalledTimes(3)
        expect((queue as any).addTrack).toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.any(String) }),
        )
    })

    it('smart-shuffles tracks with requester fairness metadata', async () => {
        const tracks = [
            {
                id: '1',
                title: 'A',
                author: 'Artist A',
                requestedBy: { id: 'u1' },
            },
            {
                id: '2',
                title: 'B',
                author: 'Artist B',
                requestedBy: { id: 'u2' },
            },
            {
                id: '3',
                title: 'C',
                author: 'Artist C',
                requestedBy: { id: 'u1' },
            },
        ] as unknown as Track[]
        const queue = {
            guild: { id: 'guild-1' },
            tracks: { toArray: jest.fn().mockReturnValue(tracks), size: 3 },
            clear: jest.fn(),
            addTrack: jest.fn(),
        } as unknown as GuildQueue

        const result = await smartShuffleQueue(queue)

        expect(result).toBe(true)
        expect((queue as any).clear).toHaveBeenCalled()
        expect((queue as any).addTrack).toHaveBeenCalledTimes(3)
    })

    it('removes track by position and returns removed track', async () => {
        const trackA = { title: 'A' } as Track
        const trackB = { title: 'B' } as Track
        const removeMock = jest.fn()
        const queue = {
            tracks: { toArray: jest.fn().mockReturnValue([trackA, trackB]) },
            node: { remove: removeMock },
        } as unknown as GuildQueue

        const removed = await removeTrackFromQueue(queue, 1)

        expect(removed).toBe(trackB)
        expect(removeMock).toHaveBeenCalledWith(trackB)
    })

    it('returns null when remove position is out of range', async () => {
        const queue = {
            tracks: { toArray: jest.fn().mockReturnValue([]) },
            node: { remove: jest.fn() },
        } as unknown as GuildQueue

        const removed = await removeTrackFromQueue(queue, 3)

        expect(removed).toBeNull()
    })

    it('moves track in queue and inserts at requested position', async () => {
        const trackA = { title: 'A' } as Track
        const trackB = { title: 'B' } as Track
        const trackC = { title: 'C' } as Track
        const removeMock = jest.fn()
        const insertTrackMock = jest.fn()
        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValueOnce([trackA, trackB, trackC])
                    .mockReturnValueOnce([trackA, trackC]),
            },
            node: { remove: removeMock },
            addTrack: jest.fn(),
            insertTrack: insertTrackMock,
        } as unknown as GuildQueue

        const moved = await moveTrackInQueue(queue, 1, 0)

        expect(moved).toBe(trackB)
        expect(removeMock).toHaveBeenCalledWith(trackB)
        expect(insertTrackMock).toHaveBeenCalledWith(trackB, 0)
    })

    it('rescues queue by removing unplayable tracks', async () => {
        const playableTrack = {
            title: 'Playable',
            author: 'Artist',
            url: 'https://example.com/playable',
        } as Track
        const brokenTrack = {
            title: 'Broken',
            author: '',
            url: '',
        } as Track
        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValue([playableTrack, brokenTrack]),
                size: 2,
            },
            clear: jest.fn(),
            addTrack: jest.fn(),
            repeatMode: 0,
            currentTrack: playableTrack,
        } as unknown as GuildQueue

        const result = await rescueQueue(queue, { refillThreshold: 0 })

        expect(result).toEqual({
            removedTracks: 1,
            keptTracks: 1,
            addedTracks: 0,
        })
        expect((queue as any).clear).toHaveBeenCalled()
        expect((queue as any).addTrack).toHaveBeenCalledWith(playableTrack)
    })

    it('probe-based rescue removes tracks that fail player.search', async () => {
        const resolvableTrack = {
            title: 'Good Track',
            author: 'Artist A',
            url: 'https://youtube.com/good',
        } as Track
        const deadTrack = {
            title: 'Dead Track',
            author: 'Artist B',
            url: 'https://youtube.com/removed',
        } as Track
        const searchMock = jest
            .fn()
            .mockImplementationOnce(() =>
                Promise.resolve({ tracks: [resolvableTrack] }),
            )
            .mockImplementationOnce(() => Promise.resolve({ tracks: [] }))
        const queue = {
            player: { search: searchMock },
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValue([resolvableTrack, deadTrack]),
                size: 2,
            },
            clear: jest.fn(),
            addTrack: jest.fn(),
            currentTrack: null,
        } as unknown as GuildQueue

        const result = await rescueQueue(queue, {
            probeResolvable: true,
            refillThreshold: 0,
        })

        expect(result.removedTracks).toBe(1)
        expect(result.keptTracks).toBe(1)
        expect((queue as any).addTrack).toHaveBeenCalledWith(resolvableTrack)
        expect((queue as any).addTrack).not.toHaveBeenCalledWith(deadTrack)
    })

    it('probe-based rescue treats timed-out probe as unresolvable', async () => {
        const track = {
            title: 'Stalled Track',
            author: 'Artist',
            url: 'https://youtube.com/stalled',
        } as Track
        const searchMock = jest.fn().mockImplementation(
            () =>
                new Promise(() => {
                    /* never resolves */
                }),
        )
        const queue = {
            player: { search: searchMock },
            tracks: { toArray: jest.fn().mockReturnValue([track]), size: 1 },
            clear: jest.fn(),
            addTrack: jest.fn(),
            currentTrack: null,
        } as unknown as GuildQueue

        const result = await rescueQueue(queue, {
            probeResolvable: true,
            probeTimeoutMs: 50,
            refillThreshold: 0,
        })

        expect(result.removedTracks).toBe(1)
        expect(result.keptTracks).toBe(0)
        expect((queue as any).addTrack).not.toHaveBeenCalled()
    })
})
