import { jest } from '@jest/globals'

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

describe('queueManipulation — Spotify priority', () => {
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
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
    })

    it('uses song-core query for Spotify engine when seed has artist-song format', async () => {
        const searchMock = jest.fn().mockResolvedValue({
            tracks: [
                {
                    title: 'Shape of You',
                    author: 'Ed Sheeran',
                    url: 'https://open.spotify.com/track/abc',
                    source: 'spotify',
                    durationMS: 234000,
                },
            ],
        })

        const queue = createQueueMock({
            currentTrack: {
                title: 'Ed Sheeran - Shape of You',
                author: 'Ed SheeranVEVO',
                url: 'https://youtube.com/watch?v=seed001',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstCallQuery: string = searchMock.mock.calls[0]?.[0] ?? ''
        expect(firstCallQuery).not.toContain(
            'Ed Sheeran - Shape of You Ed Sheeran',
        )
        expect(firstCallQuery).toContain('Shape of You')
        expect(firstCallQuery).toContain('Ed Sheeran')
    })

    it('prefers Spotify candidate over YouTube candidate of the same song', async () => {
        const addedTracks: unknown[] = []
        const ytTrack = {
            title: 'Halo',
            author: 'Beyoncé',
            url: 'https://youtube.com/watch?v=haloyt',
            source: 'youtube',
            durationMS: 241000,
        }
        const spotifyTrack = {
            title: 'Halo',
            author: 'Beyoncé',
            url: 'https://open.spotify.com/track/halo001',
            source: 'spotify',
            durationMS: 241000,
        }

        const queue = createQueueMock({
            currentTrack: {
                title: 'Crazy In Love',
                author: 'Beyoncé',
                url: 'https://youtube.com/watch?v=seed001',
                source: 'youtube',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 7, toArray: jest.fn().mockReturnValue([]) },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [ytTrack, spotifyTrack],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const selected = addedTracks[0] as { source?: string }
        expect(selected?.source).toBe('spotify')
    })

    it('uses cleaned title directly when author already appears in the title', async () => {
        const searchMock = jest.fn().mockResolvedValue({
            tracks: [
                {
                    title: 'ao pressão',
                    author: 'ANATOMIA',
                    url: 'https://open.spotify.com/track/aopressao',
                    source: 'spotify',
                    durationMS: 210000,
                },
            ],
        })

        const queue = createQueueMock({
            currentTrack: {
                title: 'ANATOMIA - ao pressão (Visualizer)',
                author: 'ANATOMIA',
                url: 'https://youtube.com/watch?v=aopressao',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstCallQuery: string = searchMock.mock.calls[0]?.[0] ?? ''
        expect(firstCallQuery).not.toBe('ao pressão ANATOMIA')
        expect(firstCallQuery).toContain('ANATOMIA')
        expect(firstCallQuery).toContain('ao pressão')
    })

    it('uses title artist (not cover channel author) in spotify query', async () => {
        const searchMock = jest.fn().mockResolvedValue({
            tracks: [
                {
                    title: 'Eu sei que é você',
                    author: 'ANATOMIA',
                    url: 'https://open.spotify.com/track/eusei001',
                    source: 'spotify',
                    durationMS: 195000,
                },
            ],
        })

        const queue = createQueueMock({
            currentTrack: {
                title: 'ANATOMIA - Eu sei que é você (Acústico ao vivo)',
                author: 'Carlo Gatto',
                url: 'https://youtube.com/watch?v=carlogatto01',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstCallQuery: string = searchMock.mock.calls[0]?.[0] ?? ''
        expect(firstCallQuery).toContain('ANATOMIA')
        expect(firstCallQuery).not.toContain('Carlo Gatto')
        expect(firstCallQuery).toContain('Eu sei que é você')
    })

    it('falls back to cleanedAuthor when title has no separator', async () => {
        const searchMock = jest.fn().mockResolvedValue({
            tracks: [
                {
                    title: 'Blinding Lights',
                    author: 'The Weeknd',
                    url: 'https://open.spotify.com/track/blight01',
                    source: 'spotify',
                    durationMS: 200000,
                },
            ],
        })

        const queue = createQueueMock({
            currentTrack: {
                title: 'Blinding Lights',
                author: 'The Weeknd',
                url: 'https://youtube.com/watch?v=blindinglight',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstCallQuery: string = searchMock.mock.calls[0]?.[0] ?? ''
        expect(firstCallQuery).toContain('The Weeknd')
    })

    it('never appends query modifiers to the Spotify engine query on subsequent replenish cycles', async () => {
        const capturedQueries: Array<{ query: string; engine: unknown }> = []
        const searchMock = jest
            .fn()
            .mockImplementation(
                (query: string, opts: { searchEngine: unknown }) => {
                    capturedQueries.push({ query, engine: opts?.searchEngine })
                    return Promise.resolve({
                        tracks: [
                            {
                                title: 'Shape of You',
                                author: 'Ed Sheeran',
                                url: 'https://open.spotify.com/track/shapeofyou',
                                source: 'spotify',
                                durationMS: 234000,
                            },
                        ],
                    })
                },
            )

        const queue = createQueueMock({
            guild: { id: 'guild-spotify-modifier-test' },
            currentTrack: {
                title: 'Ed Sheeran - Shape of You',
                author: 'Ed SheeranVEVO',
                url: 'https://youtube.com/watch?v=seed001',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            player: { search: searchMock },
        })

        // First call: replenishCount=0, no modifier
        await replenishQueue(queue as unknown as GuildQueue)
        // Second call: replenishCount=1, modifier='similar' — must NOT appear in Spotify query
        await replenishQueue(queue as unknown as GuildQueue)

        // Spotify returns results on every call, so YouTube/AUTO are never reached.
        // All captured queries are Spotify queries — none should contain text modifiers.
        for (const { query } of capturedQueries) {
            expect(query).not.toMatch(/\b(similar|like|playlist|mix)\b/)
        }
    })

    it('uses right side as artist when song core is on the left of the separator', async () => {
        const searchMock = jest.fn().mockResolvedValue({
            tracks: [
                {
                    title: 'Halo',
                    author: 'Beyoncé',
                    url: 'https://open.spotify.com/track/halo002',
                    source: 'spotify',
                    durationMS: 241000,
                },
            ],
        })

        // Author "BeyoBeyoFan" overlaps with "Beyoncé" via the 4-char prefix "beyo",
        // so extractSongCore returns "Halo" (left). extractTitleArtistFromSong then
        // detects that the core is on the left and returns the right side "Beyoncé".
        const queue = createQueueMock({
            currentTrack: {
                title: 'Halo - Beyoncé',
                author: 'BeyoBeyoFan',
                url: 'https://youtube.com/watch?v=halobeyonce',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 0, toArray: jest.fn().mockReturnValue([]) },
            player: { search: searchMock },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstCallQuery: string = searchMock.mock.calls[0]?.[0] ?? ''
        expect(firstCallQuery).not.toContain('BeyoBeyoFan')
        expect(firstCallQuery).toContain('Beyoncé')
        expect(firstCallQuery).toContain('Halo')
    })
})

describe('queueManipulation — diversity improvements', () => {
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
        getTagTopTracksMock.mockResolvedValue([])
        getGuildSettingsMock.mockResolvedValue({ autoplayMode: 'similar' })
    })

    it('penalises acoustic/live candidates so studio versions score higher', async () => {
        const addedTracks: unknown[] = []
        const studioTrack = {
            title: 'Eu sei que é você',
            author: 'ANATOMIA',
            url: 'https://open.spotify.com/track/studio001',
            source: 'spotify',
            durationMS: 210000,
        }
        const acousticTrack = {
            title: 'Eu sei que é você (Acoustic)',
            author: 'ANATOMIA',
            url: 'https://open.spotify.com/track/acoustic001',
            source: 'spotify',
            durationMS: 210000,
        }

        const queue = createQueueMock({
            currentTrack: {
                title: 'Outra Música',
                author: 'Other Artist',
                url: 'https://youtube.com/watch?v=seed002',
                source: 'youtube',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 7, toArray: jest.fn().mockReturnValue([]) },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [acousticTrack, studioTrack],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const firstAdded = addedTracks[0] as { title?: string }
        expect(firstAdded?.title).toBe('Eu sei que é você')
    })

    it('deduplicates cover variant of now-playing song so it is not queued', async () => {
        const addedTracks: unknown[] = []
        const coverTrack = {
            title: 'ANATOMIA - Água viva (Cover - ao vivo)',
            author: 'ANATOMIA',
            url: 'https://youtube.com/watch?v=cover001',
            source: 'youtube',
            durationMS: 230000,
        }
        const differentTrack = {
            title: 'Outra Música',
            author: 'Other Artist',
            url: 'https://open.spotify.com/track/other001',
            source: 'spotify',
            durationMS: 210000,
        }

        const queue = createQueueMock({
            guild: { id: 'guild-cover-dedup-test' },
            currentTrack: {
                title: 'ANATOMIA - Água viva',
                author: 'ANATOMIA',
                url: 'https://youtube.com/watch?v=original',
                source: 'youtube',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 7, toArray: jest.fn().mockReturnValue([]) },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [coverTrack, differentTrack],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const titles = addedTracks.map((t) => (t as { title: string }).title)
        expect(titles).not.toContain('ANATOMIA - Água viva (Cover - ao vivo)')
        expect(titles).toContain('Outra Música')
    })

    it('limits current-track artist to 1 more track when currentTrack counts as first', async () => {
        const addedTracks: unknown[] = []
        const makeTrack = (id: string, artist: string) => ({
            title: `Song ${id}`,
            author: artist,
            url: `https://open.spotify.com/track/${id}`,
            source: 'spotify',
            durationMS: 210000,
        })

        const queue = createQueueMock({
            currentTrack: {
                title: 'First Song',
                author: 'ANATOMIA',
                url: 'https://youtube.com/watch?v=first',
                source: 'youtube',
                requestedBy: { id: 'user-1' },
            } as unknown as Track,
            metadata: { requestedBy: { id: 'user-1' } },
            tracks: { size: 7, toArray: jest.fn().mockReturnValue([]) },
            addTrack: jest.fn((t: unknown) => addedTracks.push(t)),
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        makeTrack('a1', 'ANATOMIA'),
                        makeTrack('a2', 'ANATOMIA'),
                        makeTrack('b1', 'Other Artist'),
                    ],
                }),
            },
        })

        await replenishQueue(queue as unknown as GuildQueue)

        const artistsAdded = addedTracks.map(
            (t) => (t as { author: string }).author,
        )
        const anatomiaCount = artistsAdded.filter(
            (a) => a === 'ANATOMIA',
        ).length
        expect(anatomiaCount).toBeLessThanOrEqual(1)
    })

    it('applies Spanish/Latin genre penalty when session has no Spanish markers', async () => {
        const latinPlayer = {
            search: jest.fn().mockResolvedValue({
                tracks: [
                    {
                        title: 'Reggaeton Mix',
                        author: 'Latin Artist',
                        url: 'https://example.com/latin',
                    },
                ],
            }),
        }
        const queue = createQueueMock({
            history: {
                tracks: {
                    toArray: jest.fn().mockReturnValue([
                        {
                            title: 'Rock Song',
                            author: 'Rock Artist',
                            url: 'https://example.com/r',
                            durationMS: 240000,
                        },
                        {
                            title: 'Pop Song',
                            author: 'Pop Artist',
                            url: 'https://example.com/p',
                            durationMS: 200000,
                        },
                    ]),
                },
            },
            player: latinPlayer,
        })

        await replenishQueue(queue as unknown as GuildQueue)

        expect(queue.addTrack.mock.calls.length).toBeGreaterThan(0)
        const addedTrack = queue.addTrack.mock.calls[0][0] as {
            metadata: { recommendationReason: string }
        }
        expect(addedTrack.metadata.recommendationReason).toContain(
            'genre mismatch: latin/spanish',
        )
    })

    it('does not apply Spanish penalty when session has Spanish markers', async () => {
        const latinPlayer = {
            search: jest.fn().mockResolvedValue({
                tracks: [
                    {
                        title: 'Reggaeton Mix',
                        author: 'Latin Artist',
                        url: 'https://example.com/latin',
                    },
                ],
            }),
        }
        const queue = createQueueMock({
            history: {
                tracks: {
                    toArray: jest.fn().mockReturnValue([
                        {
                            title: 'Cumbia vieja',
                            author: 'Artist',
                            url: 'https://example.com/c',
                            durationMS: 200000,
                        },
                        {
                            title: 'Bachata romántica',
                            author: 'Artist',
                            url: 'https://example.com/b',
                            durationMS: 200000,
                        },
                    ]),
                },
            },
            player: latinPlayer,
        })

        await replenishQueue(queue as unknown as GuildQueue)

        if (queue.addTrack.mock.calls.length > 0) {
            const addedTrack = queue.addTrack.mock.calls[0][0] as {
                metadata: { recommendationReason: string }
            }
            expect(addedTrack.metadata.recommendationReason).not.toContain(
                'genre mismatch: latin/spanish',
            )
        }
    })

})
