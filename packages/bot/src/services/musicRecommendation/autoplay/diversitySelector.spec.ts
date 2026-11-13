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
    __resetRecentlyRecommendedForTests,
} from './diversitySelector'

describe('diversitySelector', () => {
    let mockQueue: Partial<GuildQueue>
    let mockTrack: Partial<Track>

    beforeEach(() => {
        jest.clearAllMocks()
        // Module-level cache: every addSelectedTracks call writes to it.
        __resetRecentlyRecommendedForTests()

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

    describe('per-artist cap with co-credits', () => {
        test('counts "Artist, Remixer" against the seed artist cap', () => {
            const pick = (author: string, title: string, score: number) => ({
                track: { author, title, source: 'youtube' } as Track,
                score,
                basis: { source: 'spotify-rec' as const, signals: [] },
            })
            const candidates = new Map([
                ['a', pick('Michael Jackson, Steve Aoki', 'Thriller', 0.9)],
                ['b', pick('Michael Jackson', 'Beat It', 0.8)],
                ['c', pick('Prince', 'Kiss', 0.5)],
            ])
            const selected = selectDiverseCandidates(
                candidates,
                3,
                2,
                5,
                'michael jackson',
            )
            expect(selected.map((c) => c.track.title)).toEqual([
                'Thriller',
                'Kiss',
            ])
        })

        test.each([
            'Michael Jackson feat. Steve Aoki',
            'Michael Jackson ft. Steve Aoki',
            'Michael Jackson; Steve Aoki',
        ])('counts "%s" against the seed artist cap', (author) => {
            const pick = (by: string, title: string, score: number) => ({
                track: { author: by, title, source: 'youtube' } as Track,
                score,
                basis: { source: 'spotify-rec' as const, signals: [] },
            })
            const candidates = new Map([
                ['a', pick(author, 'Thriller', 0.9)],
                ['b', pick('Michael Jackson', 'Beat It', 0.8)],
            ])
            const selected = selectDiverseCandidates(
                candidates,
                3,
                2,
                5,
                'michael jackson',
            )
            expect(selected.map((c) => c.track.title)).toEqual(['Thriller'])
        })
    })

    // Prod 2026-11-12/13 (guild Job): autoplay queued another version of a
    // song that had just played, or a cover of the seed artist's own song.
    describe('other versions of the same song', () => {
        const played = (title: string, author: string) =>
            buildExcludedKeys(
                mockQueue as GuildQueue,
                { title, author } as Track,
                [],
            )

        test.each([
            [
                'SZA - Kill Bill (Official Audio)',
                'SZA',
                'SZA - Kill Bill (SOS Tour Recap)',
                'SZA',
            ],
            [
                'Kanye West - Good Life ft. T-Pain',
                'Kanye West',
                'Good Life',
                'Kanye West',
            ],
            [
                'Michael Jackson - Thriller (Official Video - Shortened Version)',
                'Michael Jackson',
                'Thriller',
                'Michael Jackson',
            ],
            [
                'Michael Jackson - Beat It (Official 4K Video)',
                'Michael Jackson',
                'Beat It - Michael Jackson (Lyrics)',
                'Art of Yourself',
            ],
            ['Simple Man', 'Lynyrd Skynyrd', 'Simple Man (Cover)', 'Shinedown'],
        ])(
            'after "%s" (%s), "%s" (%s) is a duplicate',
            (pt, pa, title, author) => {
                const candidate = { title, author, url: 'https://x/y' } as Track
                expect(
                    isDuplicateCandidate(candidate, new Set(), played(pt, pa)),
                ).toBe(true)
            },
        )

        test('a different song by the same artist is not a duplicate', () => {
            const candidate = {
                title: 'SZA - Snooze (Official Audio)',
                author: 'SZA',
                url: 'https://x/y',
            } as Track
            expect(
                isDuplicateCandidate(
                    candidate,
                    new Set(),
                    played('SZA - Kill Bill (Official Audio)', 'SZA'),
                ),
            ).toBe(false)
        })

        test("keeps the seed artist's version over a higher-scored cover", () => {
            const pick = (author: string, title: string, score: number) => ({
                track: { author, title, source: 'spotify' } as Track,
                score,
                basis: { source: 'seed-similar' as const, signals: [] },
            })
            const candidates = new Map([
                ['a', pick('Shinedown', 'Simple Man', 1.9)],
                ['b', pick('Lynyrd Skynyrd', 'Simple Man', 1.6)],
                ['c', pick('Tom Petty', 'Free Fallin', 1.5)],
            ])
            const selected = selectDiverseCandidates(
                candidates,
                3,
                2,
                5,
                'lynyrd skynyrd',
            )
            expect(
                selected.map((c) => `${c.track.title} - ${c.track.author}`),
            ).toEqual([
                'Simple Man - Lynyrd Skynyrd',
                'Free Fallin - Tom Petty',
            ])
        })

        test('picks one version of a song uploaded under different titles', () => {
            const pick = (author: string, title: string, score: number) => ({
                track: { author, title, source: 'youtube' } as Track,
                score,
                basis: { source: 'seed-similar' as const, signals: [] },
            })
            const candidates = new Map([
                ['a', pick('Aerosmith', 'Aerosmith - Dream On (Audio)', 1.9)],
                ['b', pick('Lost Panda', 'Aerosmith - Dream On (Lyrics)', 1.8)],
                ['c', pick('Dire Straits', 'Sultans Of Swing', 1.5)],
            ])
            const selected = selectDiverseCandidates(candidates, 3, 2, 5, '')
            expect(selected.map((c) => c.track.author)).toEqual([
                'Aerosmith',
                'Dire Straits',
            ])
        })
    })

    describe('reserved anchor slot (#2961)', () => {
        const pick = (
            title: string,
            author: string,
            score: number,
            source: 'seed-similar' | 'lastfm-loved',
        ) => ({
            track: { title, author, source: 'youtube' } as Track,
            score,
            basis: { source, signals: [] },
        })
        const pool = () =>
            new Map([
                ['a', pick('Loved One', 'Loved A', 2.4, 'lastfm-loved')],
                ['b', pick('Loved Two', 'Loved B', 2.3, 'lastfm-loved')],
                ['c', pick('Seed Hit', 'Seed Artist', 1.9, 'seed-similar')],
                ['d', pick('Related Hit', 'Related', 1.5, 'seed-similar')],
            ])

        test('keeps the best seed-similar pick when the anchor is reserved', () => {
            const selected = selectDiverseCandidates(pool(), 2, 2, 5, '', true)
            const titles = selected.map((c) => c.track.title)
            expect(titles).toHaveLength(2)
            expect(titles).toContain('Seed Hit')
            expect(titles).toContain('Loved One')
        })

        test('ranks by score alone without the reservation', () => {
            const selected = selectDiverseCandidates(pool(), 2, 2, 5, '')
            expect(selected.map((c) => c.track.title)).toEqual([
                'Loved One',
                'Loved Two',
            ])
        })

        test('does not reserve a seed-similar pick with no positive score', () => {
            const candidates = pool()
            candidates.set(
                'c',
                pick('Seed Hit', 'Seed Artist', -0.2, 'seed-similar'),
            )
            candidates.delete('d')
            const selected = selectDiverseCandidates(
                candidates,
                2,
                2,
                5,
                '',
                true,
            )
            expect(selected.map((c) => c.track.title)).toEqual([
                'Loved One',
                'Loved Two',
            ])
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

    describe('covers of a song in the same batch', () => {
        function candidate(title: string, author: string, score: number) {
            return {
                track: {
                    title,
                    author,
                    url: `http://example.com/${author}/${title}`,
                    source: 'spotify',
                    raw: {},
                } as unknown as Track,
                score,
                basis: { source: 'seed-similar' as const, signals: [] },
            }
        }
        const pick = (pool: ReturnType<typeof candidate>[], seed = '') =>
            selectDiverseCandidates(
                new Map(pool.map((c, i) => [String(i), c])),
                10,
                2,
                20,
                seed,
            ).map((s) => `${s.track.author} - ${s.track.title}`)

        test('drops a higher-scored cover when the original is in the batch (prod 2026-11-13)', () => {
            // Seed "Free Bird": Shinedown's cover outscored Lynyrd Skynyrd's
            // own "Simple Man", which recency decay had pushed down.
            const selected = pick([
                candidate('Simple Man', 'Shinedown', 1.65),
                candidate('Trailer', 'Mudcrutch', 1.6),
                candidate('Simple Man', 'Lynyrd Skynyrd', 1.5),
                candidate(
                    'Lynyrd Skynyrd - Simple Man (Audio)',
                    'Lynyrd Skynyrd',
                    1.1,
                ),
            ])

            expect(selected).not.toContain('Shinedown - Simple Man')
            expect(selected).toContain('Lynyrd Skynyrd - Simple Man')
            expect(selected).toContain('Mudcrutch - Trailer')
        })

        test('counts a version suffix and a re-upload naming the artist toward the original', () => {
            const selected = pick([
                candidate('Fortunate Son', 'Bob Seger', 1.43),
                candidate(
                    'Fortunate Son',
                    'Creedence Clearwater Revival',
                    1.43,
                ),
                candidate(
                    'Fortunate Son - Remastered / Live At The Oakland Coliseum',
                    'Creedence Clearwater Revival',
                    1.26,
                ),
                candidate(
                    'Spiderbait - Black Betty (Audio)',
                    'Spiderbait',
                    0.96,
                ),
                candidate(
                    'Ram Jam - Black Betty (Official Video)',
                    'RamJamVEVO',
                    0.95,
                ),
                candidate('Black Betty', 'Ram Jam - Topic', 0.94),
            ])

            expect(selected).not.toContain('Bob Seger - Fortunate Son')
            expect(selected).not.toContain(
                'Spiderbait - Spiderbait - Black Betty (Audio)',
            )
            expect(selected).toContain(
                'Creedence Clearwater Revival - Fortunate Son',
            )
        })

        test('breaks a one-to-one tie toward the seed artist', () => {
            const selected = pick(
                [
                    candidate('Simple Man', 'Shinedown', 1.65),
                    candidate('Simple Man', 'Lynyrd Skynyrd', 1.5),
                ],
                'lynyrd skynyrd',
            )

            expect(selected).toEqual(['Lynyrd Skynyrd - Simple Man'])
        })

        test('keeps only the best-scored version of an undecidable one-to-one pair', () => {
            // The cover filter cannot tell which is the original, so it drops
            // neither; the song-identity dedupe (#3031) still keeps a batch to
            // one version of a song, since the owner asked for related songs,
            // not other versions of the same one.
            const selected = pick([
                candidate('Hallelujah (Edit)', 'Jeff Buckley', 1.2),
                candidate('Hallelujah (Version)', 'Leonard Cohen', 1.1),
            ])

            expect(selected).toEqual(['Jeff Buckley - Hallelujah (Edit)'])
        })

        test('does not credit an artist whose name is only part of a title', () => {
            // "Heart" (the band) is in the batch; "Heart of Gold" must not
            // count as a Heart upload, or Heart would win the vote and no
            // version would be told apart from the original.
            const selected = pick([
                candidate('Barracuda', 'Heart', 1.3),
                candidate('Heart of Gold', 'Boney M.', 1.25),
                candidate('Heart of Gold', 'Neil Young', 1.2),
                candidate(
                    'Neil Young - Heart of Gold (Official)',
                    'Neil Young',
                    1.0,
                ),
            ])

            expect(selected).not.toContain('Boney M. - Heart of Gold')
            expect(selected).toContain('Neil Young - Heart of Gold')
        })

        test('detects covers between non-Latin artist names', () => {
            const selected = pick([
                candidate('Группа крови', 'Би-2', 1.3),
                candidate('Группа крови', 'Кино', 1.2),
                candidate('Кино - Группа крови (Official)', 'Кино', 1.0),
            ])

            expect(selected).not.toContain('Би-2 - Группа крови')
            expect(selected).toContain('Кино - Группа крови')
        })

        test('groups an "Uploader - Artist - Song" upload with the song', () => {
            const selected = pick([
                candidate('Dream On', 'Some Cover Band', 1.3),
                candidate('Dream On', 'Aerosmith', 1.2),
                candidate(
                    'Lost Panda - Aerosmith - Dream On (Lyrics)',
                    'Lost Panda',
                    0.9,
                ),
            ])

            expect(selected).not.toContain('Some Cover Band - Dream On')
            expect(selected).toContain('Aerosmith - Dream On')
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

    describe('enqueue no longer writes history (#2667)', () => {
        const pick = {
            track: {
                url: 'https://youtube.com/watch?v=queuedClear',
                title: 'Queued Song',
                author: 'Queued Artist',
                id: 'queued-1',
            } as Track,
            score: 0.9,
            basis: { source: 'spotify-rec' as const, signals: [] },
        }

        function queueFor(guildId: string): GuildQueue {
            return {
                ...mockQueue,
                guild: { id: guildId },
                tracks: { toArray: jest.fn(() => []) },
                addTrack: jest.fn(),
            } as unknown as GuildQueue
        }

        test('adding a pick does not write a track_history row', async () => {
            const { trackHistoryService } = require('@lucky/shared/services')

            await addSelectedTracks(
                queueFor('g-1'),
                [pick],
                new Set(),
                new Set(),
            )

            expect(trackHistoryService.addTrackToHistory).not.toHaveBeenCalled()
        })

        test('a pick cleared from the queue stays excluded for that guild only', async () => {
            await addSelectedTracks(
                queueFor('g-1'),
                [pick],
                new Set(),
                new Set(),
            )

            const sameGuild = buildExcludedUrls(
                queueFor('g-1'),
                mockTrack as Track,
                [],
            )
            const otherGuild = buildExcludedUrls(
                queueFor('g-2'),
                mockTrack as Track,
                [],
            )

            expect(sameGuild.has(pick.track.url)).toBe(true)
            expect(sameGuild.has('queuedClear')).toBe(true)
            expect(otherGuild.has(pick.track.url)).toBe(false)
        })

        test('the same song from another URL is excluded by its title keys', async () => {
            await addSelectedTracks(
                queueFor('g-1'),
                [pick],
                new Set(),
                new Set(),
            )

            const keys = buildExcludedKeys(
                queueFor('g-1'),
                mockTrack as Track,
                [],
            )
            const otherUrl = {
                ...pick.track,
                url: 'https://open.spotify.com/track/other',
            } as Track

            expect(isDuplicateCandidate(otherUrl, new Set(), keys)).toBe(true)
        })

        test('each pick expires 2 hours after it was picked, not after the latest pick', async () => {
            const now = jest.spyOn(Date, 'now')
            try {
                now.mockReturnValue(0)
                await addSelectedTracks(
                    queueFor('g-1'),
                    [pick],
                    new Set(),
                    new Set(),
                )
                const later = {
                    ...pick,
                    track: {
                        ...pick.track,
                        url: 'https://youtube.com/watch?v=laterPick00',
                        title: 'Later Song',
                    } as Track,
                }
                now.mockReturnValue(90 * 60 * 1000)
                await addSelectedTracks(
                    queueFor('g-1'),
                    [later],
                    new Set(),
                    new Set(),
                )

                now.mockReturnValue(2 * 60 * 60 * 1000 + 1)
                const urls = buildExcludedUrls(
                    queueFor('g-1'),
                    mockTrack as Track,
                    [],
                )

                expect(urls.has(pick.track.url)).toBe(false)
                expect(urls.has(later.track.url)).toBe(true)
            } finally {
                now.mockRestore()
            }
        })
    })
})
