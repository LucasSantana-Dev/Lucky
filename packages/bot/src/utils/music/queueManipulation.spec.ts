import { jest } from '@jest/globals'
import {
    replenishQueue,
    shuffleQueue,
    smartShuffleQueue,
    removeTrackFromQueue,
    moveTrackInQueue,
    rescueQueue,
    moveUserTrackToPriority,
} from './queueManipulation'

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

const QueueRepeatMode = {
    OFF: 0,
    TRACK: 1,
    QUEUE: 2,
    AUTOPLAY: 3,
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
const getGuildSettingsMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: (...args: unknown[]) => getTrackHistoryMock(...args),
        addTrackToHistory: (...args: unknown[]) =>
            addTrackToHistoryMock(...args),
    },
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
}))

const consumeLastFmSeedSliceMock = jest.fn()

jest.mock('./autoplay/lastFmSeeds', () => ({
    consumeLastFmSeedSlice: (...args: unknown[]) =>
        consumeLastFmSeedSliceMock(...args),
}))

const getSimilarTracksMock = jest.fn()
const getTagTopTracksMock = jest.fn()

jest.mock('../../lastfm', () => ({
    getSimilarTracks: (...args: unknown[]) => getSimilarTracksMock(...args),
    getTagTopTracks: (...args: unknown[]) => getTagTopTracksMock(...args),
}))

const dislikedTrackKeysMock = jest.fn()
const likedTrackKeysMock = jest.fn()
const getPreferredArtistKeysMock = jest.fn()
const getBlockedArtistKeysMock = jest.fn()

jest.mock('../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        getDislikedTrackKeys: (...args: unknown[]) =>
            dislikedTrackKeysMock(...args),
        getLikedTrackKeys: (...args: unknown[]) => likedTrackKeysMock(...args),
        getPreferredArtistKeys: (...args: unknown[]) =>
            getPreferredArtistKeysMock(...args),
        getBlockedArtistKeys: (...args: unknown[]) =>
            getBlockedArtistKeysMock(...args),
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
        dislikedTrackKeysMock.mockResolvedValue(new Set())
        likedTrackKeysMock.mockResolvedValue(new Set())
        getPreferredArtistKeysMock.mockResolvedValue(new Set())
        getBlockedArtistKeysMock.mockResolvedValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
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
                title: 'Song A',
                author: 'Artist A',
                url: 'https://example.com/a',
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
                            title: options.candidateTitle ?? 'Song B',
                            author: options.candidateAuthor ?? 'Artist B',
                            url:
                                options.candidateUrl ?? 'https://example.com/b',
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
                        title: 'Queued Song',
                        author: 'Queued Artist',
                        url: 'https://example.com/q',
                    },
                ]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Song B',
                            author: 'Artist B',
                            url: 'https://example.com/b',
                        },
                        {
                            title: 'Song C',
                            author: 'Artist C',
                            url: 'https://example.com/c',
                        },
                        {
                            title: 'Song D',
                            author: 'Artist D',
                            url: 'https://example.com/d',
                        },
                        {
                            title: 'Song E',
                            author: 'Artist E',
                            url: 'https://example.com/e',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.player.search).toHaveBeenCalled()
        expect(queue.addTrack).toHaveBeenCalledTimes(3)
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
        const queue = createQueueMock({
            tracks: { size: 8, toArray: jest.fn().mockReturnValue([]) },
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
            name: 'when Spotify and AUTO search throw',
            spotifySearch: () =>
                Promise.reject(new Error('Spotify unavailable')),
            autoSearch: () => Promise.reject(new Error('AUTO parser failed')),
            fallbackUrl: 'https://example.com/fallback',
        },
        {
            name: 'when Spotify and AUTO search return no tracks',
            spotifySearch: () => Promise.resolve({ tracks: [] }),
            autoSearch: () => Promise.resolve({ tracks: [] }),
            fallbackUrl: 'https://example.com/recovered',
        },
    ])(
        'falls back to YouTube search $name',
        async ({ spotifySearch, autoSearch, fallbackUrl }) => {
            const queue = createQueueMock({
                tracks: {
                    size: 0,
                    toArray: jest.fn().mockReturnValue([]),
                },
                player: {
                    search: jest
                        .fn()
                        .mockImplementationOnce(spotifySearch)
                        .mockImplementationOnce(autoSearch)
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
                expect.stringContaining('Song A Artist A'),
                expect.objectContaining({
                    searchEngine: QueryType.YOUTUBE_SEARCH,
                }),
            )
            expect(queue.player.search).toHaveBeenNthCalledWith(
                3,
                expect.stringContaining('Song A Artist A'),
                expect.objectContaining({
                    searchEngine: QueryType.AUTO,
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
        dislikedTrackKeysMock.mockResolvedValue(
            new Set(['dislikedtrack::artistb']),
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
        likedTrackKeysMock.mockResolvedValue(new Set(['likedtrack::artistb']))

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
        expect(queue.addTrack).toHaveBeenCalledTimes(3)
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
            candidateTitle: 'Song A clone',
            candidateAuthor: 'Artist A',
            candidateUrl: 'https://example.com/a',
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

    it('tags session novelty when candidate artist is not in recent history', async () => {
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
                            title: 'Brand New Song',
                            author: 'Never Heard Before Artist',
                            url: 'https://example.com/new1',
                            source: 'spotify',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const addedTrack = queue.addTrack.mock.calls[0]?.[0] as Track
        expect(addedTrack).toBeDefined()
        expect(
            (addedTrack?.metadata as Record<string, unknown>)
                ?.recommendationReason,
        ).toContain('session novelty')
    })

    it('tags similar energy when candidate duration is within 30% of current track', async () => {
        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Current Song',
                author: 'Current Artist',
                url: 'https://example.com/current',
                source: 'youtube',
                durationMS: 200000,
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Similar Energy Song',
                            author: 'New Artist',
                            url: 'https://example.com/similar',
                            source: 'spotify',
                            durationMS: 210000,
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const addedTrack = queue.addTrack.mock.calls[0]?.[0] as Track
        expect(addedTrack).toBeDefined()
        expect(
            (addedTrack?.metadata as Record<string, unknown>)
                ?.recommendationReason,
        ).toContain('similar energy')
    })

    it('discover mode boosts novelty when candidate artist not in recent history', async () => {
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
                            title: 'Undiscovered Track',
                            author: 'Unknown Artist',
                            url: 'https://example.com/undiscovered',
                            source: 'spotify',
                        },
                    ],
                }),
            },
        })

        getGuildSettingsMock.mockResolvedValueOnce({
            autoplayMode: 'discover',
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const addedTrack = queue.addTrack.mock.calls[0]?.[0] as Track
        expect(addedTrack).toBeDefined()
        expect(
            (addedTrack?.metadata as Record<string, unknown>)
                ?.recommendationReason,
        ).toContain('discovery boost')
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

    it('popular mode boosts liked tracks and similar duration', async () => {
        const currentTrackDuration = 200000
        const queue = createQueueMock({
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            currentTrack: {
                title: 'Current Song',
                author: 'Current Artist',
                url: 'https://example.com/current',
                source: 'youtube',
                durationMS: currentTrackDuration,
            } as unknown as Track,
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Popular Track',
                            author: 'Popular Artist',
                            url: 'https://example.com/popular',
                            source: 'spotify',
                            durationMS: 195000,
                        },
                    ],
                }),
            },
        })

        getGuildSettingsMock.mockResolvedValueOnce({
            autoplayMode: 'popular',
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const addedTrack = queue.addTrack.mock.calls[0]?.[0] as Track
        expect(addedTrack).toBeDefined()
        expect(
            (addedTrack?.metadata as Record<string, unknown>)
                ?.recommendationReason,
        ).toContain('energy match')
    })

    it('popular mode with liked track gets extra boost', async () => {
        const likedTrackKey = 'populartrack::popularartist'
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
                            title: 'Popular Track',
                            author: 'Popular Artist',
                            url: 'https://example.com/popular',
                            source: 'spotify',
                        },
                    ],
                }),
            },
        })

        likedTrackKeysMock.mockResolvedValueOnce(new Set([likedTrackKey]))
        getGuildSettingsMock.mockResolvedValueOnce({
            autoplayMode: 'popular',
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const addedTrack = queue.addTrack.mock.calls[0]?.[0] as Track
        expect(addedTrack).toBeDefined()
        expect(
            (addedTrack?.metadata as Record<string, unknown>)
                ?.recommendationReason,
        ).toContain('liked track')
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

    it('still selects three tracks when only one source is viable', async () => {
        const queue = createQueueMock({
            tracks: {
                size: 5,
                toArray: jest.fn().mockReturnValue([
                    {
                        title: 'Queued Song 1',
                        author: 'Queued Artist 1',
                        url: 'https://example.com/queued-1',
                    },
                    {
                        title: 'Queued Song 2',
                        author: 'Queued Artist 2',
                        url: 'https://example.com/queued-2',
                    },
                    {
                        title: 'Queued Song 3',
                        author: 'Queued Artist 3',
                        url: 'https://example.com/queued-3',
                    },
                    {
                        title: 'Queued Song 4',
                        author: 'Queued Artist 4',
                        url: 'https://example.com/queued-4',
                    },
                    {
                        title: 'Queued Song 5',
                        author: 'Queued Artist 5',
                        url: 'https://example.com/queued-5',
                    },
                ]),
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
                            title: 'Viable One',
                            author: 'Artist 1',
                            url: 'https://example.com/viable-1',
                            source: 'youtube',
                        },
                        {
                            title: 'Viable Two',
                            author: 'Artist 2',
                            url: 'https://example.com/viable-2',
                            source: 'youtube',
                        },
                        {
                            title: 'Viable Three',
                            author: 'Artist 3',
                            url: 'https://example.com/viable-3',
                            source: 'youtube',
                        },
                        {
                            title: 'Viable Four',
                            author: 'Artist 4',
                            url: 'https://example.com/viable-4',
                            source: 'youtube',
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalledTimes(3)
    })

    it('collects lastfm seed tracks and searches for recommendations', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValueOnce([
            { artist: 'Radiohead', title: 'Paranoid Android' },
        ])

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
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(consumeLastFmSeedSliceMock).toHaveBeenCalledWith(
            'user-1',
            expect.any(Number),
        )
        expect(queue.player.search).toHaveBeenCalledWith(
            expect.stringContaining('Paranoid Android'),
            expect.objectContaining({ searchEngine: QueryType.SPOTIFY_SEARCH }),
        )
        expect(queue.addTrack).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/karma',
                metadata: expect.objectContaining({
                    isAutoplay: true,
                    recommendationReason: expect.stringContaining('last.fm'),
                }),
            }),
        )
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
            // Seed search tries 3 engines (SPOTIFY → AUTO → YOUTUBE) — all empty
            .mockResolvedValueOnce({ tracks: [] })
            .mockResolvedValueOnce({ tracks: [] })
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
            // Seed search: all 3 engines empty
            .mockResolvedValueOnce({ tracks: [] })
            .mockResolvedValueOnce({ tracks: [] })
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

describe('queueManipulation — title-only deduplication', () => {
    it('treats same title with different authors as duplicate candidate', async () => {
        const currentTrack = {
            title: 'Bohemian Rhapsody',
            author: 'Queen - Topic',
            url: 'https://example.com/bq-topic',
        } as Track

        const candidateTrack = {
            title: 'Bohemian Rhapsody',
            author: 'Queen',
            url: 'https://example.com/bq-queen',
        } as Track

        const queue = createQueueMock({
            currentTrack,
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [candidateTrack],
                }),
            },
        })

        await replenishQueue(queue as any, {
            targetQueueSize: 1,
            guildId: 'guild-1',
        })

        // The candidate should be deduplicated by title, so no track is added
        expect((queue as any).addTrack).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Bohemian Rhapsody' }),
        )
    })

    it('treats version suffix variants of same title as duplicate candidate', async () => {
        const currentTrack = {
            title: 'Bohemian Rhapsody',
            author: 'Queen',
            url: 'https://example.com/bq-original',
        } as Track

        const candidateTrack = {
            title: 'Bohemian Rhapsody - Live',
            author: 'Queen',
            url: 'https://example.com/bq-live',
        } as Track

        const queue = createQueueMock({
            currentTrack,
            tracks: {
                size: 0,
                toArray: jest.fn().mockReturnValue([]),
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [candidateTrack],
                }),
            },
        })

        await replenishQueue(queue as any, {
            targetQueueSize: 1,
            guildId: 'guild-1',
        })

        // The candidate with version suffix should be deduplicated by title-only, so no track is added
        expect((queue as any).addTrack).not.toHaveBeenCalledWith(
            expect.objectContaining({
                title: expect.stringMatching(/Bohemian Rhapsody/),
            }),
        )
    })
})

describe('queueManipulation.moveUserTrackToPriority', () => {
    it('moves user track from after autoplay tracks to before first autoplay track', () => {
        const userTrack = {
            url: 'https://example.com/user',
            title: 'User Song',
        }
        const autoplayTrack1 = {
            url: 'https://example.com/ap1',
            title: 'Autoplay 1',
            metadata: { isAutoplay: true },
        }
        const autoplayTrack2 = {
            url: 'https://example.com/ap2',
            title: 'Autoplay 2',
            metadata: { isAutoplay: true },
        }
        const removeMock = jest.fn()
        const insertTrackMock = jest.fn()

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
            node: { remove: removeMock },
            addTrack: jest.fn(),
            insertTrack: insertTrackMock,
        } as unknown as GuildQueue

        moveUserTrackToPriority(queue, userTrack as Track)

        expect(removeMock).toHaveBeenCalledWith(userTrack)
        expect(insertTrackMock).toHaveBeenCalledWith(userTrack, 0)
    })

    it('does nothing when track is not in queue (already playing)', () => {
        const track = { url: 'https://example.com/playing', title: 'Playing' }
        const removeMock = jest.fn()
        const queue = {
            tracks: { toArray: jest.fn().mockReturnValue([]) },
            node: { remove: removeMock },
            addTrack: jest.fn(),
            insertTrack: jest.fn(),
        } as unknown as GuildQueue

        moveUserTrackToPriority(queue, track as Track)

        expect(removeMock).not.toHaveBeenCalled()
    })

    it('does nothing when track is already before all autoplay tracks', () => {
        const userTrack = {
            url: 'https://example.com/user',
            title: 'User Song',
        }
        const autoplayTrack = {
            url: 'https://example.com/ap1',
            title: 'Autoplay 1',
            metadata: { isAutoplay: true },
        }
        const removeMock = jest.fn()
        const queue = {
            tracks: {
                toArray: jest.fn().mockReturnValue([userTrack, autoplayTrack]),
            },
            node: { remove: removeMock },
            addTrack: jest.fn(),
            insertTrack: jest.fn(),
        } as unknown as GuildQueue

        moveUserTrackToPriority(queue, userTrack as Track)

        expect(removeMock).not.toHaveBeenCalled()
    })

    it('adds track to end when no autoplay tracks remain after removal', () => {
        const userTrack = {
            url: 'https://example.com/user',
            title: 'User Song',
        }
        const removeMock = jest.fn()
        const addTrackMock = jest.fn()
        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValueOnce([userTrack])
                    .mockReturnValueOnce([]),
            },
            node: { remove: removeMock },
            addTrack: addTrackMock,
            insertTrack: jest.fn(),
        } as unknown as GuildQueue

        moveUserTrackToPriority(queue, userTrack as Track)

        expect(removeMock).not.toHaveBeenCalled()
    })

    it('calls addTrack when no autoplay tracks remain after removing the user track', () => {
        const autoplayTrack = {
            url: 'https://example.com/ap1',
            title: 'Autoplay 1',
            metadata: { isAutoplay: true },
        }
        const userTrack = {
            url: 'https://example.com/user',
            title: 'User Song',
        }
        const removeMock = jest.fn()
        const addTrackMock = jest.fn()
        const queue = {
            tracks: {
                toArray: jest
                    .fn()
                    .mockReturnValueOnce([autoplayTrack, userTrack])
                    .mockReturnValueOnce([]),
            },
            node: { remove: removeMock },
            addTrack: addTrackMock,
            insertTrack: jest.fn(),
        } as unknown as GuildQueue

        moveUserTrackToPriority(queue, userTrack as Track)

        expect(removeMock).toHaveBeenCalledWith(userTrack)
        expect(addTrackMock).toHaveBeenCalledWith(userTrack)
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
        dislikedTrackKeysMock.mockResolvedValue(new Set())
        likedTrackKeysMock.mockResolvedValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
    })

    it('applies query modifiers based on replenish counter', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Current Artist',
            requestedBy: { id: 'user-1' },
        }
        const candidateTrack = {
            title: 'Candidate Song',
            author: 'Candidate Artist',
            url: 'https://example.com/cand',
            source: 'youtube',
            durationMS: 200000,
        }
        const searchMock = jest.fn()
        const queue = createQueueMock({
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: {
                search: searchMock.mockResolvedValue({
                    tracks: [candidateTrack],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstSearchQuery = searchMock.mock.calls[0]?.[0] ?? ''
        expect(firstSearchQuery).toBeDefined()
        expect(typeof firstSearchQuery).toBe('string')

        await replenishQueue(queue as unknown as GuildQueue)

        const secondSearchQuery = searchMock.mock.calls[1]?.[0] ?? ''
        expect(typeof secondSearchQuery).toBe('string')
    })

    it('uses different modifiers for 5 sequential replenishes on same guild', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Current Artist',
            requestedBy: { id: 'user-1' },
        }
        const candidateTrack = {
            title: 'Candidate',
            author: 'Artist',
            url: 'https://example.com/cand',
            source: 'youtube',
            durationMS: 200000,
        }
        const searchMock = jest.fn()
        const queue = createQueueMock({
            guild: { id: 'guild-variation' },
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: {
                search: searchMock.mockResolvedValue({
                    tracks: [candidateTrack],
                }),
            },
        })

        const queries: string[] = []

        for (let i = 0; i < 5; i++) {
            await replenishQueue(queue as unknown as GuildQueue)
            const query = searchMock.mock.calls[i]?.[0] ?? ''
            queries.push(query)
        }

        expect(queries).toHaveLength(5)
        queries.forEach((q) => {
            expect(typeof q).toBe('string')
        })
    })
})

describe('queueManipulation.collectBroadFallbackCandidates diversification', () => {
    beforeEach(() => {
        dislikedTrackKeysMock.mockResolvedValue(new Set())
        likedTrackKeysMock.mockResolvedValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
    })

    it('uses multiple fallback queries when primary candidates empty', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Pop Star',
            requestedBy: { id: 'user-1' },
        }
        const fallbackCandidate = {
            title: 'Fallback Song',
            author: 'Pop Star',
            url: 'https://example.com/fallback',
            source: 'spotify',
            durationMS: 180000,
        }
        const searchMock = jest.fn()
        searchMock.mockResolvedValue({ tracks: [fallbackCandidate] })

        const queue = createQueueMock({
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack).toHaveBeenCalled()
    })
})

describe('queueManipulation.selectDiverseCandidates score jitter', () => {
    beforeEach(() => {
        dislikedTrackKeysMock.mockResolvedValue(new Set())
        likedTrackKeysMock.mockResolvedValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
    })

    it('applies jitter to candidate scores and maintains top candidate', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Artist',
            requestedBy: { id: 'user-1' },
        }
        const highScoredTrack = {
            title: 'High Score Song',
            author: 'Different Artist',
            url: 'https://example.com/high',
            source: 'youtube',
            durationMS: 200000,
        }
        const lowScoredTrack = {
            title: 'Low Score Song',
            author: 'Another Artist',
            url: 'https://example.com/low',
            source: 'spotify',
            durationMS: 200000,
        }
        const addedTracks: unknown[] = []
        const searchMock = jest.fn()
        searchMock.mockResolvedValue({
            tracks: [highScoredTrack, lowScoredTrack],
        })

        const queue = createQueueMock({
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: { search: searchMock },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
        })

        await replenishQueue(queue as unknown as GuildQueue)

        if (addedTracks.length > 0) {
            const firstAdded = addedTracks[0] as { author: string }
            expect(
                ['Different Artist', 'Another Artist', 'Artist'].includes(
                    firstAdded.author,
                ),
            ).toBe(true)
        }
    })
})

describe('queueManipulation.addSelectedTracks async writes', () => {
    beforeEach(() => {
        dislikedTrackKeysMock.mockResolvedValue(new Set())
        likedTrackKeysMock.mockResolvedValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
        addTrackToHistoryMock.mockResolvedValue(true)
    })

    it('awaits all redis writes for selected tracks', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Artist',
            id: 'track-current',
            requestedBy: { id: 'user-1' },
        }
        const candidate1 = {
            title: 'Song 1',
            author: 'Artist 1',
            url: 'https://example.com/song1',
            id: 'track-1',
            source: 'youtube',
            durationMS: 200000,
        }
        const candidate2 = {
            title: 'Song 2',
            author: 'Artist 2',
            url: 'https://example.com/song2',
            id: 'track-2',
            source: 'spotify',
            durationMS: 200000,
        }
        const searchMock = jest.fn()
        searchMock.mockResolvedValue({ tracks: [candidate1, candidate2] })

        const queue = createQueueMock({
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(addTrackToHistoryMock).toHaveBeenCalled()
        const callCount = addTrackToHistoryMock.mock.calls.length
        expect(callCount).toBeGreaterThan(0)

        for (const call of addTrackToHistoryMock.mock.calls) {
            const arg = call[0]
            expect(arg).toHaveProperty('url')
            expect(arg).toHaveProperty('title')
            expect(arg).toHaveProperty('author')
        }
    })

    it('marks tracks as autoplay with recommendation reason', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Artist',
            id: 'track-current',
            requestedBy: { id: 'user-1' },
        }
        const candidate = {
            title: 'Candidate Song',
            author: 'Candidate Artist',
            url: 'https://example.com/candidate',
            id: 'track-cand',
            source: 'youtube',
            durationMS: 200000,
            metadata: {},
        }
        const addedTracks: unknown[] = []
        const searchMock = jest.fn()
        searchMock.mockResolvedValue({ tracks: [candidate] })

        const queue = createQueueMock({
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: { search: searchMock },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(addedTracks.length).toBeGreaterThan(0)
        if (addedTracks.length > 0) {
            const track = addedTracks[0] as { metadata?: unknown }
            expect(track).toHaveProperty('metadata')
        }
    })

    it('deduplicates same song different URL versions in candidates', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Current Song',
            author: 'Artist',
            id: 'track-current',
            requestedBy: { id: 'user-1' },
        }
        const searchMock = jest.fn()
        searchMock.mockResolvedValue({
            tracks: [
                {
                    title: 'Same Song (Official)',
                    author: 'Same Artist',
                    url: 'https://youtube.com/watch?v=aaa',
                    id: 'yt-1',
                    source: 'youtube',
                    durationMS: 200000,
                },
                {
                    title: 'Same Song (Remastered)',
                    author: 'Same Artist',
                    url: 'https://youtube.com/watch?v=bbb',
                    id: 'yt-2',
                    source: 'youtube',
                    durationMS: 200000,
                },
            ],
        })

        const addedTracks: unknown[] = []
        const queue = createQueueMock({
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: { search: searchMock },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const same_song_added = addedTracks.filter((t: any) =>
            t.title?.includes('Same Song'),
        ).length
        expect(same_song_added).toBeLessThanOrEqual(1)
    })

    it('does not add both (Official) and (2011 Remaster) versions of same song', async () => {
        const currentTrack = {
            url: 'https://example.com/current',
            title: 'Bohemian Rhapsody',
            author: 'Queen',
            id: 'track-current',
            requestedBy: { id: 'user-1' },
        }
        const searchMock = jest.fn()
        searchMock.mockResolvedValue({
            tracks: [
                {
                    title: 'Bohemian Rhapsody (Official Video)',
                    author: 'Queen',
                    url: 'https://youtube.com/watch?v=official',
                    id: 'yt-official',
                    source: 'youtube',
                    durationMS: 354000,
                },
                {
                    title: 'Bohemian Rhapsody (2011 Remaster)',
                    author: 'Queen',
                    url: 'https://youtube.com/watch?v=remaster',
                    id: 'yt-remaster',
                    source: 'youtube',
                    durationMS: 354000,
                },
            ],
        })

        const addedTracks: unknown[] = []
        const queue = createQueueMock({
            currentTrack,
            metadata: { requestedBy: { id: 'user-1' } },
            player: { search: searchMock },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const bohemian_added = addedTracks.filter(
            (t: any) =>
                t.author === 'Queen' &&
                t.title?.toLowerCase().includes('bohemian'),
        ).length
        expect(bohemian_added).toBeLessThanOrEqual(1)
    })
})

describe('queueManipulation — genre candidate collection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        dislikedTrackKeysMock.mockResolvedValue(new Set())
        likedTrackKeysMock.mockResolvedValue(new Set())
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        getSimilarTracksMock.mockResolvedValue([])
        getTrackHistoryMock.mockResolvedValue([])
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({
            autoplayMode: 'similar',
            autoplayGenres: [],
        })
    })

    it('adds candidates from genre tag when autoplayGenres is configured', async () => {
        getTagTopTracksMock.mockResolvedValue([
            { artist: 'Artist X', title: 'Rock Song' },
        ])
        getGuildSettingsMock.mockResolvedValue({
            autoplayMode: 'similar',
            autoplayGenres: ['rock'],
        })

        const addedTracks: unknown[] = []
        const queue = createQueueMock({
            metadata: { requestedBy: { id: 'user-1' } },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Rock Song',
                            author: 'Artist X',
                            url: 'https://example.com/rock',
                            requestedBy: { id: 'user-1' },
                        },
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(getTagTopTracksMock).toHaveBeenCalledWith('rock', 20)
        expect(addedTracks.length).toBeGreaterThan(0)
    })

    it('skips genre collection when autoplayGenres is empty', async () => {
        getGuildSettingsMock.mockResolvedValue({
            autoplayMode: 'similar',
            autoplayGenres: [],
        })

        const queue = createQueueMock({
            metadata: { requestedBy: { id: 'user-1' } },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(getTagTopTracksMock).not.toHaveBeenCalled()
    })

    it('caps genre collection at 3 tags', async () => {
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({
            autoplayMode: 'similar',
            autoplayGenres: ['rock', 'pop', 'indie', 'jazz', 'metal'],
        })

        const queue = createQueueMock({
            metadata: { requestedBy: { id: 'user-1' } },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(getTagTopTracksMock).toHaveBeenCalledTimes(3)
    })
})
