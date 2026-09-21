import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        addTrackToHistory: jest.fn(() => Promise.resolve(true)),
    },
}))

jest.mock('./queueMarkers', () => ({
    markAsAutoplayTrack: jest.fn(),
    markAndRecordAutoplayTrack: jest.fn(() => Promise.resolve()),
}))

import {
    buildExcludedUrls,
    buildExcludedKeys,
    isDuplicateCandidate,
    selectDiverseCandidates,
    purgeDuplicatesOfCurrentTrack,
    addSelectedTracks,
} from './diversitySelector'

describe('diversitySelector', () => {
    let mockQueue: Partial<GuildQueue>
    let mockTrack: Partial<Track>

    beforeEach(() => {
        jest.clearAllMocks()

        mockTrack = {
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'Test Song',
            author: 'Test Artist',
            id: 'test-id',
        }

        mockQueue = {
            tracks: {
                toArray: jest.fn(() => []),
            },
            history: {
                tracks: {
                    toArray: jest.fn(() => []),
                },
            },
        }
    })

    describe('buildExcludedUrls', () => {
        test('builds excluded URLs from current and history tracks including video IDs', () => {
            const historyTracks: Partial<Track>[] = [
                { url: 'https://www.youtube.com/watch?v=oldTrack1' },
                { url: 'https://www.youtube.com/watch?v=oldTrack2' },
            ]

            const excluded = buildExcludedUrls(
                mockQueue as GuildQueue,
                mockTrack as Track,
                historyTracks as Track[],
            )

            expect(
                excluded.has('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
            ).toBe(true)
            expect(excluded.has('dQw4w9WgXcQ')).toBe(true)
            expect(
                excluded.has('https://www.youtube.com/watch?v=oldTrack1'),
            ).toBe(true)
        })

        test('handles short URLs and persistent history', () => {
            const shortTrack: Partial<Track> = {
                url: 'https://youtu.be/dQw4w9WgXcQ',
            }
            const persistentHistory = [
                { url: 'https://www.youtube.com/watch?v=persistent1' },
            ]

            const excluded = buildExcludedUrls(
                mockQueue as GuildQueue,
                shortTrack as Track,
                [],
                persistentHistory,
            )

            expect(excluded.has('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
            expect(excluded.has('dQw4w9WgXcQ')).toBe(true)
            expect(
                excluded.has('https://www.youtube.com/watch?v=persistent1'),
            ).toBe(true)
        })
    })

    describe('buildExcludedKeys', () => {
        test('builds normalized keys from track data and handles missing fields', () => {
            const historyTracks: Partial<Track>[] = [
                { title: 'Old Song', author: 'Old Artist' },
            ]

            const excluded = buildExcludedKeys(
                mockQueue as GuildQueue,
                mockTrack as Track,
                historyTracks as Track[],
            )

            expect(excluded.size).toBeGreaterThan(0)
            expect(
                Array.from(excluded).some((key) => key.includes('testsong')),
            ).toBe(true)

            const trackWithoutMeta: Partial<Track> = {
                title: undefined,
                author: undefined,
            }
            expect(() => {
                buildExcludedKeys(
                    mockQueue as GuildQueue,
                    trackWithoutMeta as Track,
                    [],
                )
            }).not.toThrow()
        })

        test('includes persistent history keys', () => {
            const persistentHistory = [
                { title: 'Old Song', author: 'Old Artist' },
            ]

            const excluded = buildExcludedKeys(
                mockQueue as GuildQueue,
                mockTrack as Track,
                [],
                persistentHistory,
            )

            expect(excluded.size).toBeGreaterThan(0)
        })
    })

    describe('isDuplicateCandidate', () => {
        test('detects duplicates by URL, video ID, or normalized key', () => {
            let excludedUrls = new Set([
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            ])
            let excludedKeys = new Set<string>()
            let track: Partial<Track> = {
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                title: 'Some Song',
                author: 'Some Artist',
            }
            expect(
                isDuplicateCandidate(
                    track as Track,
                    excludedUrls,
                    excludedKeys,
                ),
            ).toBe(true)

            excludedUrls = new Set(['dQw4w9WgXcQ'])
            expect(
                isDuplicateCandidate(
                    track as Track,
                    excludedUrls,
                    excludedKeys,
                ),
            ).toBe(true)

            excludedUrls = new Set<string>()
            excludedKeys = new Set(['somesong::someartist'])
            track = {
                url: 'https://example.com/different',
                title: 'Some Song',
                author: 'Some Artist',
            }
            expect(
                isDuplicateCandidate(
                    track as Track,
                    excludedUrls,
                    excludedKeys,
                ),
            ).toBe(true)
        })

        test('handles non-duplicates, missing URLs, and variant titles correctly', () => {
            const excludedUrls = new Set([
                'https://www.youtube.com/watch?v=old',
            ])
            const excludedKeys = new Set(['oldsong::oldartist'])
            let track: Partial<Track> = {
                url: 'https://www.youtube.com/watch?v=new',
                title: 'New Song',
                author: 'New Artist',
            }
            expect(
                isDuplicateCandidate(
                    track as Track,
                    excludedUrls,
                    excludedKeys,
                ),
            ).toBe(false)

            track = { url: undefined, title: 'New Song', author: 'New Artist' }
            expect(
                isDuplicateCandidate(
                    track as Track,
                    excludedUrls,
                    excludedKeys,
                ),
            ).toBe(false)

            let variantUrls = new Set<string>()
            let variantKeys = new Set([
                'bohemian rhapsody',
                'hotel california',
                'live and let die',
            ])

            track = {
                url: 'https://open.spotify.com/track/xyz',
                title: 'Bohemian Rhapsody - Remastered',
                author: 'Queen',
            }
            expect(
                isDuplicateCandidate(track as Track, variantUrls, variantKeys),
            ).toBe(true)

            track = {
                url: 'https://open.spotify.com/track/abc',
                title: 'Hotel California - Live',
                author: 'Eagles',
            }
            expect(
                isDuplicateCandidate(track as Track, variantUrls, variantKeys),
            ).toBe(true)

            track = {
                url: 'https://open.spotify.com/track/def',
                title: 'Live and Let Die - Remastered',
                author: 'Wings',
            }
            expect(
                isDuplicateCandidate(track as Track, variantUrls, variantKeys),
            ).toBe(true)
        })
    })

    describe('selectDiverseCandidates', () => {
        test('selects diverse candidates respecting limits and preferring high scores', () => {
            const candidates = new Map([
                [
                    'track1',
                    {
                        track: {
                            author: 'Artist A',
                            source: 'youtube',
                            title: 'Song 1',
                        } as Track,
                        score: 0.9,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
                [
                    'track2',
                    {
                        track: {
                            author: 'Artist B',
                            source: 'spotify',
                            title: 'Song 2',
                        } as Track,
                        score: 0.95,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
                [
                    'track3',
                    {
                        track: {
                            author: 'Artist C',
                            source: 'youtube',
                            title: 'Song 3',
                        } as Track,
                        score: 0.5,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
            ])

            const selected = selectDiverseCandidates(candidates, 2, 2, 3, '')
            expect(selected.length).toBeLessThanOrEqual(2)
            expect(selected.length).toBeGreaterThan(0)
            expect(selected[0].score).toBeGreaterThanOrEqual(
                selected[1]?.score ?? -1,
            )
        })

        test('respects maxPerArtist and maxPerSource limits', () => {
            const singleArtistCandidates = new Map([
                [
                    'track1',
                    {
                        track: {
                            author: 'Same Artist',
                            source: 'youtube',
                            title: 'Song 1',
                        } as Track,
                        score: 0.9,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
                [
                    'track2',
                    {
                        track: {
                            author: 'Same Artist',
                            source: 'youtube',
                            title: 'Song 2',
                        } as Track,
                        score: 0.8,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
            ])
            let selected = selectDiverseCandidates(
                singleArtistCandidates,
                3,
                1,
                3,
                '',
            )
            expect(selected.length).toBe(1)

            const singleSourceCandidates = new Map([
                [
                    'track1',
                    {
                        track: {
                            author: 'Artist A',
                            source: 'youtube',
                            title: 'Song 1',
                        } as Track,
                        score: 0.9,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
                [
                    'track2',
                    {
                        track: {
                            author: 'Artist B',
                            source: 'youtube',
                            title: 'Song 2',
                        } as Track,
                        score: 0.8,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
            ])
            selected = selectDiverseCandidates(
                singleSourceCandidates,
                3,
                3,
                1,
                '',
            )
            expect(selected.length).toBe(1)

            selected = selectDiverseCandidates(new Map(), 5, 2, 3, '')
            expect(selected).toEqual([])
        })

        test('returns fewer tracks when supply is insufficient', () => {
            const candidates = new Map([
                [
                    'track1',
                    {
                        track: {
                            author: 'Artist A',
                            source: 'youtube',
                            title: 'Song 1',
                        } as Track,
                        score: 0.9,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
            ])

            const selected = selectDiverseCandidates(candidates, 5, 2, 3, '')
            expect(selected.length).toBe(1)
        })
    })

    describe('same-album soft penalty', () => {
        function makeCandidate(
            title: string,
            author: string,
            score: number,
            albumName?: string,
        ) {
            return {
                track: {
                    title,
                    author,
                    url: `http://example.com/${title}`,
                    source: 'spotify',
                    raw: albumName ? { album: { name: albumName } } : {},
                } as unknown as Track,
                score,
                basis: { source: 'spotify-rec' as const, signals: [] },
            }
        }

        test('penalizes same-album tracks or excludes if score too low', () => {
            const candidates = new Map([
                ['a', makeCandidate('Track A', 'Artist 1', 0.9, 'Great Album')],
                [
                    'b',
                    makeCandidate('Track B', 'Artist 2', 0.85, 'Great Album'),
                ],
                [
                    'c',
                    makeCandidate('Track C', 'Artist 3', 0.05, 'Great Album'),
                ],
                ['d', makeCandidate('Track D', 'Artist 4', 0.5)],
            ])

            const selected = selectDiverseCandidates(candidates, 4, 2, 3, '')

            const titles = selected.map((s) => s.track.title)
            expect(titles).toContain('Track A')
            expect(titles).not.toContain('Track C')
        })

        test('does not penalize tracks without album metadata', () => {
            const candidates = new Map([
                ['a', makeCandidate('Track A', 'Artist 1', 0.9)],
                ['b', makeCandidate('Track B', 'Artist 2', 0.8)],
            ])

            const selected = selectDiverseCandidates(candidates, 2, 2, 3, '')
            expect(selected).toHaveLength(2)
        })
    })

    describe('purgeDuplicatesOfCurrentTrack', () => {
        test('removes duplicates and ignores non-duplicates and empty queues', () => {
            const dupTrack: Partial<Track> = {
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                title: 'Different Title',
                author: 'Different Author',
            }
            const queueRemove = jest.fn()
            let mockQueueWithTracks: Partial<GuildQueue> = {
                ...mockQueue,
                tracks: { toArray: jest.fn(() => [dupTrack as Track]) },
                node: { remove: queueRemove } as any,
            }
            purgeDuplicatesOfCurrentTrack(
                mockQueueWithTracks as GuildQueue,
                mockTrack as Track,
            )
            expect(queueRemove).toHaveBeenCalled()

            jest.clearAllMocks()
            const otherTrack: Partial<Track> = {
                url: 'https://www.youtube.com/watch?v=different',
                title: 'Different Song',
                author: 'Different Artist',
            }
            mockQueueWithTracks = {
                ...mockQueue,
                tracks: { toArray: jest.fn(() => [otherTrack as Track]) },
                node: { remove: jest.fn() } as any,
            }
            purgeDuplicatesOfCurrentTrack(
                mockQueueWithTracks as GuildQueue,
                mockTrack as Track,
            )
            expect(
                (mockQueueWithTracks.node as any).remove,
            ).not.toHaveBeenCalled()

            mockQueueWithTracks = {
                ...mockQueue,
                tracks: { toArray: jest.fn(() => []) },
                node: { remove: jest.fn() } as any,
            }
            expect(() => {
                purgeDuplicatesOfCurrentTrack(
                    mockQueueWithTracks as GuildQueue,
                    mockTrack as Track,
                )
            }).not.toThrow()
        })
    })

    describe('addSelectedTracks', () => {
        let markAndRecordAutoplayTrackMock: jest.Mock

        beforeEach(() => {
            jest.clearAllMocks()
            const { markAndRecordAutoplayTrack } = require('./queueMarkers')
            markAndRecordAutoplayTrackMock =
                markAndRecordAutoplayTrack as jest.Mock
        })

        test('marks and records each selected track with user ID or undefined', async () => {
            const mockQueueWithAdd: Partial<GuildQueue> = {
                ...mockQueue,
                guild: { id: 'guild-id-123' },
                tracks: { toArray: jest.fn(() => []) },
                addTrack: jest.fn(),
            }

            const track1: Partial<Track> = {
                url: 'https://youtube.com/track1',
                title: 'Track 1',
                author: 'Artist 1',
                id: 'track-1',
            }
            const track2: Partial<Track> = {
                url: 'https://youtube.com/track2',
                title: 'Track 2',
                author: 'Artist 2',
                id: 'track-2',
            }

            const selected = [
                {
                    track: track1 as Track,
                    score: 0.8,
                    basis: {
                        source: 'spotify-rec' as const,
                        signals: ['preferred artist'],
                    },
                },
                {
                    track: track2 as Track,
                    score: 0.7,
                    basis: {
                        source: 'lastfm-similar' as const,
                        signals: ['liked artist', 'energy match'],
                    },
                },
            ]

            await addSelectedTracks(
                mockQueueWithAdd as GuildQueue,
                selected,
                new Set(),
                new Set(),
                'requesting-user-id',
            )
            expect(markAndRecordAutoplayTrackMock).toHaveBeenCalledTimes(2)
            expect(markAndRecordAutoplayTrackMock).toHaveBeenNthCalledWith(
                1,
                track1,
                expect.objectContaining({ source: 'spotify-rec' }),
                'guild-id-123',
                'requesting-user-id',
                undefined,
            )

            jest.clearAllMocks()
            await addSelectedTracks(
                mockQueueWithAdd as GuildQueue,
                [selected[0]],
                new Set(),
                new Set(),
            )
            expect(markAndRecordAutoplayTrackMock).toHaveBeenCalledWith(
                track1,
                expect.any(Object),
                'guild-id-123',
                undefined,
                undefined,
            )
        })

        test('passes autoplay mode when provided', async () => {
            const mockQueueWithAdd: Partial<GuildQueue> = {
                ...mockQueue,
                guild: { id: 'guild-id-123' },
                tracks: { toArray: jest.fn(() => []) },
                addTrack: jest.fn(),
            }

            const track: Partial<Track> = {
                url: 'https://youtube.com/track1',
                title: 'Track 1',
                author: 'Artist 1',
                id: 'track-1',
            }

            const selected = [
                {
                    track: track as Track,
                    score: 0.8,
                    basis: {
                        source: 'spotify-rec' as const,
                        signals: ['preferred artist'],
                    },
                },
            ]

            await addSelectedTracks(
                mockQueueWithAdd as GuildQueue,
                selected,
                new Set(),
                new Set(),
                'user-id',
                'discover',
            )
            expect(markAndRecordAutoplayTrackMock).toHaveBeenCalledWith(
                track,
                expect.any(Object),
                'guild-id-123',
                'user-id',
                'discover',
            )

            jest.clearAllMocks()
            await addSelectedTracks(
                mockQueueWithAdd as GuildQueue,
                selected,
                new Set(),
                new Set(),
                'user-id',
                'popular',
            )
            expect(markAndRecordAutoplayTrackMock).toHaveBeenCalledWith(
                track,
                expect.any(Object),
                'guild-id-123',
                'user-id',
                'popular',
            )

            jest.clearAllMocks()
            await addSelectedTracks(
                mockQueueWithAdd as GuildQueue,
                selected,
                new Set(),
                new Set(),
                'user-id',
                'similar',
            )
            expect(markAndRecordAutoplayTrackMock).toHaveBeenCalledWith(
                track,
                expect.any(Object),
                'guild-id-123',
                'user-id',
                'similar',
            )
        })
    })
})
