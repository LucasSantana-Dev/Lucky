import { jest } from '@jest/globals'

// Transitively pulled in via replenisher -> skipCircuitBreaker; real module loads
// prismaClient (import.meta). Factory-mock to keep this suite loadable.
jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getAutoplaySkipRateForGuild: jest.fn(),
}))
import {
    replenishQueue,
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

describe('queueManipulation.replenishQueue', () => {
    beforeEach(() => {
        likedTrackWeightsMock.mockResolvedValue(new Map())
        dislikedTrackWeightsMock.mockResolvedValue(new Map())
        getPreferredArtistKeysMock.mockResolvedValue(new Set())
        getBlockedArtistKeysMock.mockResolvedValue(new Set())
        getImplicitDislikeKeysMock.mockResolvedValue(new Set())
        getImplicitLikeKeysMock.mockResolvedValue(new Set())
        getGuildImplicitDislikeKeysMock.mockReturnValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getArtistTopTagsMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
        getReplayFrequentTracksMock.mockResolvedValue({
            trackIds: new Set(),
            artists: new Set(),
        })
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
    })

    async function replenishWithSingleCandidate(options: {
        queueRequestedById?: string
        candidateMetadata?: Record<string, unknown>
        candidateTitle?: string
        candidateAuthor?: string
        candidateUrl?: string
    }): Promise<QueueMock> {
        const queue = createQueueMock({
            currentTrack: {
                title: 'Bohemian Rhapsody',
                author: 'Queen',
                url: 'https://example.com/bohemian',
            } as unknown as Track,
            metadata: options.queueRequestedById
                ? { requestedBy: { id: options.queueRequestedById } }
                : {},
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title:
                                options.candidateTitle ?? 'Stairway to Heaven',
                            author: options.candidateAuthor ?? 'Led Zeppelin',
                            url:
                                options.candidateUrl ??
                                'https://example.com/stairway',
                            metadata: options.candidateMetadata ?? {},
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)
        return queue
    }

    it('tops up autoplay queue with multiple tracks when below buffer', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 1,
                toArray: jest.fn().mockReturnValue([
                    {
                        title: 'Highway to Hell',
                        author: 'AC/DC',
                        url: 'https://example.com/highway',
                    },
                ]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Stairway to Heaven',
                            author: 'Led Zeppelin',
                            url: 'https://example.com/stairway',
                        },
                        {
                            title: 'Smells Like Teen Spirit',
                            author: 'Nirvana',
                            url: 'https://example.com/nirvana',
                        },
                        {
                            title: 'Purple Rain',
                            author: 'Prince',
                            url: 'https://example.com/prince',
                        },
                        {
                            title: 'Imagine',
                            author: 'John Lennon',
                            url: 'https://example.com/lennon',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.player.search).toHaveBeenCalled()
        expect(queue.addTrack).toHaveBeenCalledTimes(2)
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    recommendationReason: expect.any(String),
                    requestedById: 'user-1',
                }),
            }),
        )
    })

    it('does not search when queue already has buffer size', async () => {
        const autoplayTracks = Array.from({ length: 8 }, (_, i) => ({
            title: `Autoplay Track ${i + 1}`,
            author: `Artist ${i + 1}`,
            url: `https://example.com/autoplay-${i + 1}`,
            metadata: { isAutoplay: true },
        }))
        const queue = createQueueMock({
            tracks: {
                size: 8,
                toArray: jest.fn().mockReturnValue(autoplayTracks),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.player.search).not.toHaveBeenCalled()
        expect(queue.addTrack).not.toHaveBeenCalled()
    })

    it('skips duplicate url and normalized title+artist candidates', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([
                    {
                        title: 'Queue Song',
                        author: 'Queue Artist',
                        url: 'https://example.com/q',
                    },
                ]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song A copy',
                            author: 'Artist A',
                            url: 'https://example.com/a',
                        },
                        {
                            title: 'queue-song',
                            author: 'QUEUE ARTIST',
                            url: 'https://example.com/other',
                        },
                        {
                            title: 'Fresh Song',
                            author: 'Fresh Artist',
                            url: 'https://example.com/fresh',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.player.search).toHaveBeenCalledWith(
            expect.stringContaining('Song A Artist A'),
            expect.objectContaining({
                searchEngine: QueryType.SPOTIFY_SEARCH,
            }),
        )
        expect(queue.addTrack).toHaveBeenCalledTimes(1)
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/fresh',
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    recommendationReason: expect.any(String),
                }),
            }),
        )
    })

    it.each([
        {
            name: 'when Spotify seed search throws',
            seedSearch: () => Promise.reject(new Error('Spotify unavailable')),
            artistSearch: () =>
                Promise.reject(new Error('Artist search failed')),
            fallbackUrl: 'https://example.com/fallback',
        },
        {
            name: 'when Spotify seed search returns no tracks',
            seedSearch: () => Promise.resolve({ tracks: [] }),
            artistSearch: () => Promise.resolve({ tracks: [] }),
            fallbackUrl: 'https://example.com/recovered',
        },
    ])(
        'falls through to artist fallback $name',
        async ({ seedSearch, artistSearch, fallbackUrl }) => {
            const queue = createQueueMock({
                tracks: {
                    size: 0,
                    toArray: jest.fn().mockReturnValue([]),
                },
                player: {
                    search: jest
                        .fn()
                        .mockImplementationOnce(seedSearch)
                        .mockImplementationOnce(artistSearch)
                        .mockResolvedValueOnce({
                            tracks: [
                                {
                                    title: 'Fallback Song',
                                    author: 'Fallback Artist',
                                    url: fallbackUrl,
                                },
                            ],
                        }),
                },
            })

            await replenishQueue(queue as unknown as GuildQueue)

            expect(queue.player.search).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining('Song A Artist A'),
                expect.objectContaining({
                    searchEngine: QueryType.SPOTIFY_SEARCH,
                }),
            )
            expect(queue.player.search).toHaveBeenNthCalledWith(
                2,
                'Artist A',
                expect.objectContaining({
                    searchEngine: QueryType.SPOTIFY_SEARCH,
                }),
            )
            expect(queue.addTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: fallbackUrl,
                    metadata: expect.objectContaining({
                        isAutoplay: true,
                    }),
                }),
            )
        },
    )

    it('skips tracks disliked by the requester feedback profile', async () => {
        dislikedTrackWeightsMock.mockResolvedValue(
            new Map([['dislikedtrack::artistb', 0.8]]),
        )

        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Disliked Track',
                            author: 'Artist B',
                            url: 'https://example.com/disliked',
                        },
                        {
                            title: 'Allowed Track',
                            author: 'Artist C',
                            url: 'https://example.com/allowed',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalledTimes(1)
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/allowed',
            }),
        )
    })
    it('boosts liked tracks to the top of autoplay recommendations', async () => {
        likedTrackWeightsMock.mockResolvedValue(
            new Map([['likedtrack::artistb', 1.0]]),
        )

        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Neutral Track',
                            author: 'Artist C',
                            url: 'https://example.com/neutral',
                        },
                        {
                            title: 'Liked Track',
                            author: 'Artist B',
                            url: 'https://example.com/liked',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const calls = queue.addTrack.mock.calls
        expect(calls.length).toBeGreaterThan(0)
        const firstAdded = calls[0][0] as Track
        expect(firstAdded.url).toBe('https://example.com/liked')
        expect(firstAdded.metadata).toEqual(
            expect.objectContaining({
                isAutoplay: true,
                recommendationReason: expect.stringContaining('liked track'),
            }),
        )
    })

    it.each([
        {
            name: 'stores queue metadata requester on autoplay recommendations',
            queueRequestedById: 'queue-user',
            candidateMetadata: {},
            expectedRequestedById: 'queue-user',
        },
        {
            name: 'keeps existing candidate requester metadata when no queue requester is present',
            queueRequestedById: undefined,
            candidateMetadata: { requestedById: 'seed-user' },
            expectedRequestedById: 'seed-user',
        },
        {
            name: 'keeps requester metadata undefined when no requester context exists',
            queueRequestedById: undefined,
            candidateMetadata: {},
            expectedRequestedById: undefined,
        },
    ])('$name', async (scenario) => {
        const queue = await replenishWithSingleCandidate({
            queueRequestedById: scenario.queueRequestedById,
            candidateMetadata: scenario.candidateMetadata,
        })

        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    requestedById: scenario.expectedRequestedById,
                }),
            }),
        )
    })

    it('caps autoplay to maxTracksPerArtist when same-artist candidates score highest', async () => {
        // 3 tracks from 'Artist B' + 1 from 'Artist C'. With MAX_TRACKS_PER_ARTIST=2 (default),
        // should pick at most 2 from 'Artist B' + 1 from 'Artist C' = 3 total (buffer needs 4)
        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Same Artist 1',
                            author: 'Artist B',
                            url: 'https://example.com/b1',
                            source: 'soundcloud',
                        },
                        {
                            title: 'Same Artist 2',
                            author: 'Artist B',
                            url: 'https://example.com/b2',
                            source: 'soundcloud',
                        },
                        {
                            title: 'Same Artist 3',
                            author: 'Artist B',
                            url: 'https://example.com/b3',
                            source: 'soundcloud',
                        },
                        {
                            title: 'Fresh Song',
                            author: 'Artist C',
                            url: 'https://example.com/c1',
                            source: 'spotify',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        // Should have at most 2 tracks from Artist B + 1 from Artist C = 3 total
        const calls = queue.addTrack.mock.calls
        const artistBCount = calls.filter(
            (c) => (c[0] as Track).author === 'Artist B',
        ).length
        expect(artistBCount).toBeLessThanOrEqual(2)
        expect(queue.addTrack).toHaveBeenCalledTimes(2)
    })

    it('caps autoplay tracks by source when all candidates are from same source', async () => {
        // 5 candidates all from 'youtube'. With MAX_TRACKS_PER_SOURCE=3 (default), at most 3 selected.
        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
                source: 'spotify',
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Y Song 1',
                            author: 'Artist B',
                            url: 'https://example.com/y1',
                            source: 'youtube',
                        },
                        {
                            title: 'Y Song 2',
                            author: 'Artist C',
                            url: 'https://example.com/y2',
                            source: 'youtube',
                        },
                        {
                            title: 'Y Song 3',
                            author: 'Artist D',
                            url: 'https://example.com/y3',
                            source: 'youtube',
                        },
                        {
                            title: 'Y Song 4',
                            author: 'Artist E',
                            url: 'https://example.com/y4',
                            source: 'youtube',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const calls = queue.addTrack.mock.calls
        const youtubeCount = calls.filter(
            (c) => (c[0] as Track).source === 'youtube',
        ).length
        expect(youtubeCount).toBeLessThanOrEqual(3)
    })

    it('returns without adding tracks when candidate set is exhausted', async () => {
        const queue = await replenishWithSingleCandidate({
            candidateTitle: 'Bohemian Rhapsody',
            candidateAuthor: 'Queen',
            candidateUrl: 'https://example.com/bohemian',
        })

        expect(queue.addTrack).not.toHaveBeenCalled()
    })

    it('adds unique autoplay candidates even when search results omit url', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Fresh Song',
                            author: 'Fresh Artist',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Fresh Song',
                author: 'Fresh Artist',
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    recommendationReason: expect.any(String),
                    requestedById: 'user-1',
                }),
            }),
        )
    })

    it('discover mode prefers new artists over familiar ones', async () => {
        const recentArtist = 'Recent Artist'
        const newArtist = 'New Artist'
        const trackHistory = [
            {
                title: 'Past Track 1',
                author: recentArtist,
                url: 'https://example.com/past1',
                source: 'youtube',
            },
            {
                title: 'Past Track 2',
                author: recentArtist,
                url: 'https://example.com/past2',
                source: 'youtube',
            },
        ]

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Current Song',
                author: 'Current Artist',
                url: 'https://example.com/current',
                source: 'youtube',
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Familiar Track',
                            author: recentArtist,
                            url: 'https://example.com/familiar',
                            source: 'spotify',
                        },
                        {
                            title: 'New Track',
                            author: newArtist,
                            url: 'https://example.com/new',
                            source: 'spotify',
                        },
                    ],
                }),
            },
        })

        getTrackHistoryMock.mockResolvedValueOnce(trackHistory)
        getGuildSettingsMock.mockResolvedValueOnce({
            autoplayMode: 'discover',
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const addedTracks = queue.addTrack.mock.calls.map((c) => c[0])
        expect(addedTracks.some((t) => t.author === newArtist)).toBe(true)
    })

    it('prefers a different-source candidate when scores are otherwise close', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            history: {
                tracks: {
                    toArray: jest.fn().mockReturnValue([
                        {
                            title: 'History Song 1',
                            author: 'Same Artist',
                            url: 'https://example.com/history-1',
                        },
                        {
                            title: 'History Song 2',
                            author: 'Different Artist',
                            url: 'https://example.com/history-2',
                        },
                    ]),
                },
            },
            currentTrack: {
                title: 'Alpha Beta Gamma Delta',
                author: 'Current Artist',
                url: 'https://example.com/current-diversity',
                source: 'youtube',
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Alpha Beta Gamma Delta Remix',
                            author: 'Same Artist',
                            url: 'https://example.com/same-source',
                            source: 'youtube',
                        },
                        {
                            title: 'Unrelated Fresh Cut',
                            author: 'Different Artist',
                            url: 'https://example.com/different-source',
                            source: 'spotify',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstAdded = queue.addTrack.mock.calls[0]?.[0] as Track

        expect(firstAdded).toEqual(
            expect.objectContaining({
                url: 'https://example.com/different-source',
                source: 'spotify',
                metadata: expect.objectContaining({
                    recommendationReason:
                        expect.stringContaining('source variety'),
                }),
            }),
        )
    })

    it('selects multiple tracks respecting source limits (max 3 per source)', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 5,
                toArray: jest.fn().mockReturnValue([]),
            },
            currentTrack: {
                title: 'Current Track',
                author: 'Current Artist',
                url: 'https://example.com/current-cap',
                source: 'youtube',
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'YT One',
                            author: 'Artist 1',
                            url: 'https://example.com/yt-1',
                            source: 'youtube',
                        },
                        {
                            title: 'YT Two',
                            author: 'Artist 2',
                            url: 'https://example.com/yt-2',
                            source: 'youtube',
                        },
                        {
                            title: 'YT Three',
                            author: 'Artist 3',
                            url: 'https://example.com/yt-3',
                            source: 'youtube',
                        },
                        {
                            title: 'YT Four',
                            author: 'Artist 4',
                            url: 'https://example.com/yt-4',
                            source: 'youtube',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        // Verify actual tracks were added (observable outcome)
        expect(queue.addTrack.mock.calls.length).toBeGreaterThan(0)
        expect(queue.addTrack.mock.calls.length).toBeLessThanOrEqual(3)
        // Verify they have expected properties (queue state)
        queue.addTrack.mock.calls.forEach((call) => {
            expect(call[0]).toHaveProperty('url')
            expect(call[0]).toHaveProperty('source', 'youtube')
        })
    })

    it('integrates last.fm seeds into queue through search and scoring', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValueOnce([
            { artist: 'Radiohead', title: 'Paranoid Android' },
        ])

        const addedTracks: Track[] = []
        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Karma Police',
                            author: 'Radiohead',
                            url: 'https://example.com/karma',
                        },
                    ],
                }),
            },
            addTrack: jest.fn((t) => addedTracks.push(t as Track)),
        })

        await replenishQueue(queue as unknown as GuildQueue)

        // Assert observable outcome: tracks actually added to queue
        expect(addedTracks.length).toBeGreaterThan(0)
        expect(addedTracks[0]).toHaveProperty(
            'url',
            'https://example.com/karma',
        )
        expect(addedTracks[0]).toHaveProperty('metadata')
        expect((addedTracks[0] as any).metadata?.isAutoplay).toBe(true)
    })

    it('searches similar tracks from Last.fm API and adds them with boosted score', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValueOnce([
            { artist: 'Radiohead', title: 'Creep' },
        ])
        getSimilarTracksMock.mockResolvedValue([
            { artist: 'Muse', title: 'Uprising', match: 0.85 },
        ])

        const seedSearchResult = {
            tracks: [
                {
                    title: 'Karma Police',
                    author: 'Radiohead',
                    url: 'https://example.com/karma',
                },
            ],
        }
        const similarSearchResult = {
            tracks: [
                {
                    title: 'Uprising',
                    author: 'Muse',
                    url: 'https://example.com/uprising',
                },
            ],
        }

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Creep',
                author: 'Radiohead',
                url: 'https://example.com/creep',
                requestedBy: { id: 'user-similar' },
            } as unknown as Track,
            player: {
                search: jest
                    .fn()
                    .mockResolvedValueOnce(seedSearchResult)
                    .mockResolvedValueOnce(seedSearchResult)
                    .mockResolvedValueOnce(seedSearchResult)
                    .mockResolvedValueOnce(similarSearchResult)
                    .mockResolvedValueOnce(similarSearchResult)
                    .mockResolvedValueOnce(similarSearchResult),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(getSimilarTracksMock).toHaveBeenCalledWith('Radiohead', 'Creep')
        const searchCalls = (queue.player.search as jest.Mock).mock.calls.map(
            (c: unknown[]) => c[0] as string,
        )
        expect(searchCalls.some((q) => q.includes('Uprising'))).toBe(true)
    })

    it('uses broad artist fallback when seed search returns no candidates', async () => {
        const searchMock = jest
            .fn()
            // Seed search (Spotify only) — returns empty
            .mockResolvedValueOnce({ tracks: [] })
            // Broad fallback by author — returns a candidate
            .mockResolvedValueOnce({
                tracks: [
                    {
                        title: 'Broad Match',
                        author: 'Artist A',
                        url: 'https://example.com/broad',
                        source: 'spotify',
                    },
                ],
            })

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        // Broad fallback call was made with author as query
        expect(searchMock).toHaveBeenCalledWith(
            'Artist A',
            expect.objectContaining({
                searchEngine: QueryType.SPOTIFY_SEARCH,
            }),
        )
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/broad',
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    recommendationReason:
                        expect.stringContaining('artist fallback'),
                }),
            }),
        )
    })

    it('swallows broad fallback search errors and tries the next query', async () => {
        const searchMock = jest
            .fn()
            // Seed search (Spotify only) — returns empty
            .mockResolvedValueOnce({ tracks: [] })
            // Broad fallback: first query ("Artist A") throws
            .mockRejectedValueOnce(new Error('Network blip'))
            // Second query ("Artist A popular") succeeds
            .mockResolvedValueOnce({
                tracks: [
                    {
                        title: 'Popular Pick',
                        author: 'Artist A',
                        url: 'https://example.com/popular',
                    },
                ],
            })

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(searchMock).toHaveBeenCalledWith(
            'Artist A popular',
            expect.objectContaining({
                searchEngine: QueryType.SPOTIFY_SEARCH,
            }),
        )
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/popular',
            }),
        )
    })

    it('falls back to YouTube search for last.fm when Spotify fails', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValueOnce([
            { artist: 'Radiohead', title: 'Creep' },
        ])

        const searchMock = jest
            .fn()
            // Seed search (3 engines) — return a simple track so broad fallback is not triggered
            .mockResolvedValueOnce({
                tracks: [
                    {
                        title: 'Placeholder',
                        author: 'Some Artist',
                        url: 'https://example.com/placeholder',
                    },
                ],
            })
            // Last.fm seed: Spotify rejects, YouTube returns tracks
            .mockRejectedValueOnce(new Error('Spotify down'))
            .mockResolvedValueOnce({
                tracks: [
                    {
                        title: 'Creep',
                        author: 'Radiohead',
                        url: 'https://example.com/creep',
                    },
                ],
            })

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(searchMock).toHaveBeenCalledWith(
            expect.stringContaining('Creep'),
            expect.objectContaining({
                searchEngine: QueryType.SPOTIFY_SEARCH,
            }),
        )
        expect(searchMock).toHaveBeenCalledWith(
            expect.stringContaining('Creep'),
            expect.objectContaining({
                searchEngine: QueryType.YOUTUBE_SEARCH,
            }),
        )
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/creep',
                metadata: expect.objectContaining({
                    recommendationReason: expect.stringContaining('last.fm'),
                }),
            }),
        )
    })

    it('returns empty last.fm results when all engines fail', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValueOnce([
            { artist: 'Muse', title: 'Uprising' },
        ])

        const searchMock = jest
            .fn()
            // Seed search returns one candidate so broad fallback does not run
            .mockResolvedValueOnce({
                tracks: [
                    {
                        title: 'Seed Result',
                        author: 'Seed Artist',
                        url: 'https://example.com/seed',
                    },
                ],
            })
            // Last.fm seed: both engines reject → returns []
            .mockRejectedValueOnce(new Error('Spotify down'))
            .mockRejectedValueOnce(new Error('AUTO down'))

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        // Only the seed candidate should be added — last.fm produced nothing
        const addedUrls = queue.addTrack.mock.calls.map(
            (c) => (c[0] as Track).url,
        )
        expect(addedUrls).toContain('https://example.com/seed')
        expect(addedUrls).not.toContain('https://example.com/uprising')
    })

    it('mutates existing metadata object when property is non-configurable (sealed tracks)', async () => {
        const mutableMeta: Record<string, unknown> = { requestedById: 'user-1' }
        const sealedTrack = Object.defineProperty(
            {
                title: 'Sealed Song',
                author: 'Sealed Artist',
                url: 'https://example.com/sealed',
                source: 'spotify',
                requestedBy: { id: 'user-1' },
            },
            'metadata',
            {
                get: () => mutableMeta,
                configurable: false,
                enumerable: true,
            },
        )

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Current',
                author: 'Artist',
                url: 'https://example.com/current',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [sealedTrack],
                }),
            },
        })

        await expect(
            replenishQueue(queue as unknown as GuildQueue),
        ).resolves.not.toThrow()

        expect(mutableMeta.isAutoplay).toBe(true)
    })

    it('marks autoplay metadata on tracks with a read-only metadata getter (LUCKY-2K)', async () => {
        const trackWithReadOnlyMetadata = Object.defineProperty(
            {
                title: 'Getter Song',
                author: 'Getter Artist',
                url: 'https://example.com/getter',
                source: 'spotify',
                requestedBy: { id: 'user-1' },
            },
            'metadata',
            {
                get: () => ({ requestedById: 'user-1' }),
                configurable: true,
            },
        )

        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Current',
                author: 'Artist',
                url: 'https://example.com/current',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [trackWithReadOnlyMetadata],
                }),
            },
        })

        await expect(
            replenishQueue(queue as unknown as GuildQueue),
        ).resolves.not.toThrow()

        expect(queue.addTrack).toHaveBeenCalledTimes(1)
        const added = queue.addTrack.mock.calls[0]?.[0] as Track
        expect((added?.metadata as Record<string, unknown>)?.isAutoplay).toBe(
            true,
        )
    })
})
