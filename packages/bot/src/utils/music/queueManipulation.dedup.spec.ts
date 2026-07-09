import { jest } from '@jest/globals'

jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getAutoplaySkipRateForGuild: jest.fn(),
}))
import {
    replenishQueue,
    moveUserTrackToPriority,
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

const QueryType = {
    AUTO: 'auto',
    YOUTUBE_SEARCH: 'youtubeSearch',
    SPOTIFY_SEARCH: 'spotifySearch',
} as const

type GuildQueue = any
type Track = any

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

const getTrackHistoryMock = jest.fn()
const addTrackToHistoryMock = jest.fn().mockResolvedValue(true)
const getReplayFrequentTracksMock = jest.fn()
const getGuildSettingsMock = jest.fn()
const getLastFmLinkMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: (...args: unknown[]) => getTrackHistoryMock(...args),
        addTrackToHistory: (...args: unknown[]) =>
            addTrackToHistoryMock(...args),
        getReplayFrequentTracks: (...args: unknown[]) =>
            getReplayFrequentTracksMock(...args),
    },
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => getLastFmLinkMock(...args),
    },
    spotifyLinkService: {
        getValidAccessToken: jest.fn().mockResolvedValue(null),
        getByDiscordId: jest.fn().mockResolvedValue(null),
    },
    premiumService: {
        isPremium: jest.fn(() => Promise.resolve(false)),
    },
}))

const consumeLastFmSeedSliceMock = jest.fn()
const consumeBlendedSeedSliceMock = jest.fn()

jest.mock('./autoplay/lastFmSeeds', () => ({
    LASTFM_SEED_COUNT: 15,
    consumeLastFmSeedSlice: (...args: unknown[]) =>
        consumeLastFmSeedSliceMock(...args),
    consumeBlendedSeedSlice: (...args: unknown[]) =>
        consumeBlendedSeedSliceMock(...args),
    isLovedSeed: jest.fn().mockReturnValue(false),
}))

const getSimilarTracksMock = jest.fn()
const getTagTopTracksMock = jest.fn()
const getArtistTopTagsMock = jest.fn()

jest.mock('../../lastfm', () => ({
    getSimilarTracks: (...args: unknown[]) => getSimilarTracksMock(...args),
    getTagTopTracks: (...args: unknown[]) => getTagTopTracksMock(...args),
    getArtistTopTags: (...args: unknown[]) => getArtistTopTagsMock(...args),
}))

jest.mock('../../spotify/spotifyApi', () => ({
    getAudioFeatures: jest.fn().mockResolvedValue(null),
    searchSpotifyTrack: jest.fn().mockResolvedValue(null),
    getBatchAudioFeatures: jest.fn().mockResolvedValue(new Map()),
    getArtistPopularity: jest.fn().mockResolvedValue(null),
    getArtistGenres: jest.fn().mockResolvedValue([]),
    getSpotifyRecommendations: jest.fn().mockResolvedValue([]),
}))

const getUserSpotifySeedsMock = jest.fn()

jest.mock('../../spotify/spotifyUserSeeds', () => ({
    getUserSpotifySeeds: (...args: unknown[]) =>
        getUserSpotifySeedsMock(...args),
}))

const dislikedTrackWeightsMock = jest.fn()
const likedTrackWeightsMock = jest.fn()
const getPreferredArtistKeysMock = jest.fn()
const getBlockedArtistKeysMock = jest.fn()
const getImplicitDislikeKeysMock = jest.fn()
const getImplicitLikeKeysMock = jest.fn()
const getGuildImplicitDislikeKeysMock = jest.fn()

jest.mock('../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        getLikedTrackWeights: (...args: unknown[]) =>
            likedTrackWeightsMock(...args),
        getDislikedTrackWeights: (...args: unknown[]) =>
            dislikedTrackWeightsMock(...args),
        getPreferredArtistKeys: (...args: unknown[]) =>
            getPreferredArtistKeysMock(...args),
        getBlockedArtistKeys: (...args: unknown[]) =>
            getBlockedArtistKeysMock(...args),
        getImplicitDislikeKeys: (...args: unknown[]) =>
            getImplicitDislikeKeysMock(...args),
        getImplicitLikeKeys: (...args: unknown[]) =>
            getImplicitLikeKeysMock(...args),
        getGuildImplicitDislikeKeys: (...args: unknown[]) =>
            getGuildImplicitDislikeKeysMock(...args),
    },
}))

type QueueMock = Partial<GuildQueue> & {
    player: { search: jest.Mock }
    addTrack: jest.Mock
    tracks: { size: number; toArray: jest.Mock }
    guild: { id: string }
    history?: { tracks: { toArray: jest.Mock } }
}

function createQueueMock(overrides: Partial<QueueMock> = {}): QueueMock {
    const currentTrack = {
        title: 'Song A',
        author: 'Artist A',
        url: 'https://example.com/a',
        requestedBy: { id: 'user-1' },
    } as unknown as Track

    return {
        guild: { id: 'guild-1' },
        tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
        currentTrack,
        metadata: {},
        player: {
            search: jest.fn().mockResolvedValue({
                tracks: [
                    {
                        title: 'Song B',
                        author: 'Artist B',
                        url: 'https://example.com/b',
                    },
                ],
            }),
        },
        addTrack: jest.fn(),
        ...overrides,
    }
}

describe('queueManipulation — title-only deduplication', () => {
    it('deduplicates candidates by title-only, ignoring authors and version suffixes', async () => {
        const currentTrack = {
            title: 'Bohemian Rhapsody',
            author: 'Queen',
            url: 'https://example.com/bq-original',
        } as Track

        const addedTracks: Track[] = []
        const queue = createQueueMock({
            currentTrack,
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Bohemian Rhapsody',
                            author: 'Queen - Topic',
                            url: 'https://example.com/bq-topic',
                        },
                        {
                            title: 'Bohemian Rhapsody - Live',
                            author: 'Queen',
                            url: 'https://example.com/bq-live',
                        },
                    ],
                }),
            },
            addTrack: jest.fn((t) => addedTracks.push(t as Track)),
        })

        await replenishQueue(queue as any, {
            targetQueueSize: 2,
            guildId: 'guild-1',
        })

        // No duplicate titles should be added despite different authors/versions
        expect(addedTracks.length).toBe(0)
    })
})

describe('queueManipulation — collaborator author deduplication', () => {
    it('deduplicates same song where one variant has comma-separated collaborators', async () => {
        const currentTrack = {
            title: 'Puta Mexicana',
            author: 'DJ Jesh FSC',
            url: 'https://open.spotify.com/track/aaa',
        } as Track

        const candidateWithCollaborator = {
            title: 'Puta Mexicana',
            author: 'DJ Jesh FSC, MC Biel',
            url: 'https://open.spotify.com/track/bbb',
            durationMS: 200000,
            source: 'spotify',
        } as unknown as Track

        const addedTracks: unknown[] = []
        const queue = createQueueMock({
            currentTrack,
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [candidateWithCollaborator],
                }),
            },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
        })

        await replenishQueue(queue as any, {
            targetQueueSize: 1,
            guildId: 'guild-collab-1',
        })

        expect(
            addedTracks.filter((t: any) => t.title === 'Puta Mexicana').length,
        ).toBe(0)
    })
})

describe('queueManipulation.moveUserTrackToPriority', () => {
    it('repositions user track before all autoplay tracks when present after them', () => {
        const userTrack = {
            url: 'https://example.com/user',
            title: 'User Song',
            id: 'u1',
        } as Track
        const autoplayTrack1 = {
            url: 'https://example.com/ap1',
            title: 'Autoplay 1',
            metadata: { isAutoplay: true },
            id: 'ap1',
        } as Track
        const autoplayTrack2 = {
            url: 'https://example.com/ap2',
            title: 'Autoplay 2',
            metadata: { isAutoplay: true },
            id: 'ap2',
        } as Track

        const removedTracks: Track[] = []
        const insertions: Array<{ track: Track; position: number }> = []
        const addedTracks: Track[] = []

        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValueOnce([
                        autoplayTrack1,
                        autoplayTrack2,
                        userTrack,
                    ])
                    .mockReturnValueOnce([autoplayTrack1, autoplayTrack2]),
            },
            node: { remove: jest.fn((t) => removedTracks.push(t)) },
            insertTrack: jest.fn((t, pos) =>
                insertions.push({ track: t, position: pos }),
            ),
            addTrack: jest.fn((t) => addedTracks.push(t)),
        } as unknown as GuildQueue

        moveUserTrackToPriority(queue, userTrack)

        expect(removedTracks).toContain(userTrack)
        expect(
            insertions.some((i) => i.track === userTrack && i.position === 0),
        ).toBe(true)
    })

    it('handles case where no autoplay tracks remain after removal', () => {
        const autoplayTrack = {
            url: 'https://example.com/ap1',
            title: 'Autoplay 1',
            metadata: { isAutoplay: true },
            id: 'ap1',
        } as Track
        const userTrack = {
            url: 'https://example.com/user',
            title: 'User Song',
            id: 'u1',
        } as Track

        const removedTracks: Track[] = []
        const addedTracks: Track[] = []

        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValueOnce([autoplayTrack, userTrack])
                    .mockReturnValueOnce([]),
            },
            node: { remove: jest.fn((t) => removedTracks.push(t)) },
            insertTrack: jest.fn(),
            addTrack: jest.fn((t) => addedTracks.push(t)),
        } as unknown as GuildQueue

        moveUserTrackToPriority(queue, userTrack)

        expect(removedTracks).toContain(userTrack)
        expect(addedTracks).toContain(userTrack)
    })
})

describe('queueManipulation.replenishQueue youtube dedup', () => {
    it('does not re-queue a track whose youtube video id is in history under different url format', async () => {
        const existingUrl = 'https://www.youtube.com/watch?v=yebNIHKAC4A'
        const alternateUrl = 'https://youtube.com/watch?v=yebNIHKAC4A'
        const currentTrack = {
            url: existingUrl,
            title: 'Golden KPop',
            author: 'Sony',
            requestedBy: { id: 'user-1' },
        }
        const duplicateCandidate = {
            url: alternateUrl,
            title: 'Golden KPop Official',
            author: 'Sony',
            requestedBy: null,
        }
        const addedTracks: unknown[] = []
        const queue = {
            guild: { id: 'guild-yt', name: 'Guild' },
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            history: { tracks: { toArray: jest.fn().mockReturnValue([]) } },
            repeatMode: 3,
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
            node: { play: jest.fn() },
            player: {
                search: jest
                    .fn()
                    .mockResolvedValue({ tracks: [duplicateCandidate] }),
            },
        }
        await replenishQueue(queue as unknown as GuildQueue)
        expect(addedTracks).toHaveLength(0)
    })

    it('uses finishedTrack as seed when currentTrack is null', async () => {
        const finishedTrack = {
            url: 'https://youtube.com/watch?v=test1234567',
            title: 'Done Song',
            author: 'Art',
            requestedBy: { id: 'u1' },
        }
        const queue = {
            guild: { id: 'guild-ft', name: 'G' },
            currentTrack: null,
            metadata: {},
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            history: { tracks: { toArray: jest.fn().mockReturnValue([]) } },
            repeatMode: 3,
            addTrack: jest.fn(),
            player: { search: jest.fn().mockResolvedValue({ tracks: [] }) },
        }
        await expect(
            replenishQueue(
                queue as unknown as GuildQueue,
                finishedTrack as unknown as import('discord-player').Track,
            ),
        ).resolves.not.toThrow()
    })
})

describe('queueManipulation.replenishQueue query variation', () => {
    beforeEach(() => {
        dislikedTrackWeightsMock.mockResolvedValue(new Map())
        likedTrackWeightsMock.mockResolvedValue(new Map())
        getPreferredArtistKeysMock.mockResolvedValue(new Set())
        getBlockedArtistKeysMock.mockResolvedValue(new Set())
        getImplicitDislikeKeysMock.mockResolvedValue(new Set())
        getImplicitLikeKeysMock.mockResolvedValue(new Set())
        getGuildImplicitDislikeKeysMock.mockReturnValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getArtistTopTagsMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
    })

    it('replenishes queue multiple times with varying search strategies', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Current Artist',
            requestedBy: { id: 'user-1' },
        }
        const tracks: Track[] = []
        const queue = createQueueMock({
            guild: { id: 'guild-variation' },
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song 1',
                            author: 'Artist 1',
                            url: 'https://example.com/s1',
                            source: 'youtube',
                            durationMS: 200000,
                        },
                    ],
                }),
            },
            addTrack: jest.fn((t: unknown) => tracks.push(t as Track)),
        })

        // Call replenish 3 times - should accumulate different tracks
        await replenishQueue(queue as unknown as GuildQueue)
        await replenishQueue(queue as unknown as GuildQueue)
        await replenishQueue(queue as unknown as GuildQueue)

        // Verify actual tracks were added to queue
        expect(tracks.length).toBeGreaterThan(0)
        tracks.forEach((track) => {
            expect(track).toHaveProperty('metadata')
            expect((track as any).metadata?.isAutoplay).toBe(true)
        })
    })
})
