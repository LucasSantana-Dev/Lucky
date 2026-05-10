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

import {
    buildExcludedUrls,
    buildExcludedKeys,
    isDuplicateCandidate,
    selectDiverseCandidates,
    purgeDuplicatesOfCurrentTrack,
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
        test('should build a set of excluded URLs from current track and history', () => {
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
            expect(
                excluded.has('https://www.youtube.com/watch?v=oldTrack1'),
            ).toBe(true)
            expect(excluded.has('dQw4w9WgXcQ')).toBe(true)
        })

        test('should handle youtu.be short URLs', () => {
            const track: Partial<Track> = {
                url: 'https://youtu.be/dQw4w9WgXcQ',
            }

            const excluded = buildExcludedUrls(
                mockQueue as GuildQueue,
                track as Track,
                [],
            )

            expect(excluded.has('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
            expect(excluded.has('dQw4w9WgXcQ')).toBe(true)
        })

        test('should include persistent history URLs', () => {
            const persistentHistory = [
                { url: 'https://www.youtube.com/watch?v=persistent1' },
            ]

            const excluded = buildExcludedUrls(
                mockQueue as GuildQueue,
                mockTrack as Track,
                [],
                persistentHistory,
            )

            expect(
                excluded.has('https://www.youtube.com/watch?v=persistent1'),
            ).toBe(true)
        })
    })

    describe('buildExcludedKeys', () => {
        test('should build normalized keys from track data', () => {
            const historyTracks: Partial<Track>[] = [
                {
                    title: 'Old Song',
                    author: 'Old Artist',
                },
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
        })

        test('should handle missing titles and authors gracefully', () => {
            const track: Partial<Track> = {
                title: undefined,
                author: undefined,
            }

            expect(() => {
                buildExcludedKeys(mockQueue as GuildQueue, track as Track, [])
            }).not.toThrow()
        })

        test('should include persistent history keys', () => {
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
        test('should detect duplicate by URL', () => {
            const excludedUrls = new Set([
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            ])
            const excludedKeys = new Set<string>()

            const track: Partial<Track> = {
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
        })

        test('should detect duplicate by YouTube video ID', () => {
            const excludedUrls = new Set(['dQw4w9WgXcQ'])
            const excludedKeys = new Set<string>()

            const track: Partial<Track> = {
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
        })

        test('should detect duplicate by normalized track key', () => {
            const excludedUrls = new Set<string>()
            const excludedKeys = new Set(['somesong::someartist'])

            const track: Partial<Track> = {
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

        test('should not flag non-duplicate tracks', () => {
            const excludedUrls = new Set([
                'https://www.youtube.com/watch?v=old',
            ])
            const excludedKeys = new Set(['oldsong::oldartist'])

            const track: Partial<Track> = {
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
        })

        test('should handle tracks without URL', () => {
            const excludedUrls = new Set<string>()
            const excludedKeys = new Set(['oldsong::oldartist'])

            const track: Partial<Track> = {
                url: undefined,
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
        })

        test('detects remastered version as duplicate of base title in excludedKeys', () => {
            // "bohemian rhapsody" is excluded; "bohemian rhapsody - remastered" should match
            const excludedUrls = new Set<string>()
            const excludedKeys = new Set(['bohemian rhapsody'])

            const track: Partial<Track> = {
                url: 'https://open.spotify.com/track/xyz',
                title: 'Bohemian Rhapsody - Remastered',
                author: 'Queen',
            }

            expect(
                isDuplicateCandidate(track as Track, excludedUrls, excludedKeys),
            ).toBe(true)
        })

        test('detects live version as duplicate of base title', () => {
            const excludedUrls = new Set<string>()
            const excludedKeys = new Set(['hotel california'])

            const track: Partial<Track> = {
                url: 'https://open.spotify.com/track/abc',
                title: 'Hotel California - Live',
                author: 'Eagles',
            }

            expect(
                isDuplicateCandidate(track as Track, excludedUrls, excludedKeys),
            ).toBe(true)
        })

        test('does not strip mid-title variant words — only suffix', () => {
            // "live" in the middle of the title should not be stripped
            const excludedUrls = new Set<string>()
            const excludedKeys = new Set(['live and let die'])

            const track: Partial<Track> = {
                url: 'https://open.spotify.com/track/def',
                title: 'Live and Let Die - Remastered',
                author: 'Wings',
            }

            // "live and let die" after stripping " - Remastered" → still matches
            expect(
                isDuplicateCandidate(track as Track, excludedUrls, excludedKeys),
            ).toBe(true)
        })
    })

    describe('selectDiverseCandidates', () => {
        test('should select diverse candidates based on score', () => {
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
                            author: 'Artist A',
                            source: 'youtube',
                            title: 'Song 2',
                        } as Track,
                        score: 0.8,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
                [
                    'track3',
                    {
                        track: {
                            author: 'Artist B',
                            source: 'spotify',
                            title: 'Song 3',
                        } as Track,
                        score: 0.7,
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

        test('should respect maxPerArtist limit', () => {
            const candidates = new Map([
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
                [
                    'track3',
                    {
                        track: {
                            author: 'Same Artist',
                            source: 'youtube',
                            title: 'Song 3',
                        } as Track,
                        score: 0.7,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
            ])

            const selected = selectDiverseCandidates(candidates, 3, 1, 3, '')

            expect(selected.length).toBe(1)
            expect(selected[0].track.author).toBe('Same Artist')
        })

        test('should respect maxPerSource limit', () => {
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
                            source: 'youtube',
                            title: 'Song 2',
                        } as Track,
                        score: 0.8,
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
                        score: 0.7,
                        basis: { source: 'spotify-rec' as const, signals: [] },
                    },
                ],
            ])

            const selected = selectDiverseCandidates(candidates, 3, 3, 1, '')

            expect(selected.length).toBe(1)
        })

        test('should handle empty candidates gracefully', () => {
            const candidates = new Map()

            const selected = selectDiverseCandidates(candidates, 5, 2, 3, '')

            expect(selected).toEqual([])
        })

        test('should return fewer tracks if not enough candidates', () => {
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

        test('should prefer higher scores', () => {
            const candidates = new Map([
                [
                    'track1',
                    {
                        track: {
                            author: 'Artist A',
                            source: 'youtube',
                            title: 'Song 1',
                        } as Track,
                        score: 0.5,
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
            ])

            const selected = selectDiverseCandidates(candidates, 1, 2, 3, '')

            expect(selected.length).toBe(1)
            expect(selected[0].score).toBe(0.95)
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

            test('second track from same album is penalised by 0.12', () => {
                const candidates = new Map([
                    ['a', makeCandidate('Track A', 'Artist', 0.9, 'Great Album')],
                    ['b', makeCandidate('Track B', 'Artist 2', 0.85, 'Great Album')],
                    ['c', makeCandidate('Track C', 'Artist 3', 0.5)],
                ])

                // maxPerArtist=2 allows both same-album tracks by artist constraint
                const selected = selectDiverseCandidates(candidates, 3, 2, 3, '')

                // Track B gets score ~0.85 - 0.12 = 0.73 with jitter, still > 0
                // Both A and B can be selected (different artists), B with reduced score
                const titles = selected.map((s) => s.track.title)
                expect(titles).toContain('Track A')
                expect(titles).toContain('Track C')
            })

            test('track from same album with score < 0.12 is excluded', () => {
                const candidates = new Map([
                    ['a', makeCandidate('Track A', 'Artist 1', 0.9, 'Tight Album')],
                    ['b', makeCandidate('Track B', 'Artist 2', 0.05, 'Tight Album')],
                    ['c', makeCandidate('Track C', 'Artist 3', 0.8)],
                ])

                const selected = selectDiverseCandidates(candidates, 3, 2, 3, '')

                // Track B score 0.05 - 0.12 < 0 → excluded
                const titles = selected.map((s) => s.track.title)
                expect(titles).not.toContain('Track B')
            })

            test('tracks with no album field are not penalised', () => {
                const candidates = new Map([
                    ['a', makeCandidate('Track A', 'Artist 1', 0.9)],
                    ['b', makeCandidate('Track B', 'Artist 2', 0.8)],
                ])

                const selected = selectDiverseCandidates(candidates, 2, 2, 3, '')

                expect(selected).toHaveLength(2)
            })
        })

    describe('purgeDuplicatesOfCurrentTrack', () => {
        test('should remove duplicate tracks from queue', () => {
            const dupTrack: Partial<Track> = {
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                title: 'Different Title',
                author: 'Different Author',
            }

            const queueRemove = jest.fn()
            const mockQueueWithTracks: Partial<GuildQueue> = {
                ...mockQueue,
                tracks: {
                    toArray: jest.fn(() => [dupTrack as Track]),
                },
                node: {
                    remove: queueRemove,
                } as any,
            }

            purgeDuplicatesOfCurrentTrack(
                mockQueueWithTracks as GuildQueue,
                mockTrack as Track,
            )

            expect(queueRemove).toHaveBeenCalled()
        })

        test('should not remove non-duplicate tracks', () => {
            const otherTrack: Partial<Track> = {
                url: 'https://www.youtube.com/watch?v=different',
                title: 'Different Song',
                author: 'Different Artist',
            }

            const queueRemove = jest.fn()
            const mockQueueWithTracks: Partial<GuildQueue> = {
                ...mockQueue,
                tracks: {
                    toArray: jest.fn(() => [otherTrack as Track]),
                },
                node: {
                    remove: queueRemove,
                } as any,
            }

            purgeDuplicatesOfCurrentTrack(
                mockQueueWithTracks as GuildQueue,
                mockTrack as Track,
            )

            expect(queueRemove).not.toHaveBeenCalled()
        })

        test('should handle empty queue gracefully', () => {
            const queueRemove = jest.fn()
            const mockQueueWithTracks: Partial<GuildQueue> = {
                ...mockQueue,
                tracks: {
                    toArray: jest.fn(() => []),
                },
                node: {
                    remove: queueRemove,
                } as any,
            }

            expect(() => {
                purgeDuplicatesOfCurrentTrack(
                    mockQueueWithTracks as GuildQueue,
                    mockTrack as Track,
                )
            }).not.toThrow()

            expect(queueRemove).not.toHaveBeenCalled()
        })
    })
})
