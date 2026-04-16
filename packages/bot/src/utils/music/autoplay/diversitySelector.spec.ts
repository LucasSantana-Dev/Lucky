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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'similar',
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
                        reason: 'low',
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
                        reason: 'high',
                    },
                ],
            ])

            const selected = selectDiverseCandidates(candidates, 1, 2, 3, '')

            expect(selected.length).toBe(1)
            expect(selected[0].score).toBe(0.95)
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
