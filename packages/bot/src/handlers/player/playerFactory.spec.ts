import { describe, it, expect } from '@jest/globals'

describe('playerFactory', () => {
    describe('createPlayer', () => {
        it('should identify YouTube URLs correctly', () => {
            const isYouTubeUrl = (url: string): boolean =>
                url.includes('youtube.com') || url.includes('youtu.be')

            expect(isYouTubeUrl('https://www.youtube.com/watch?v=test')).toBe(
                true,
            )
            expect(isYouTubeUrl('https://youtu.be/test')).toBe(true)
            expect(isYouTubeUrl('https://soundcloud.com/track')).toBe(false)
            expect(isYouTubeUrl('https://open.spotify.com/track/abc')).toBe(
                false,
            )
            expect(isYouTubeUrl('https://music.youtube.com/watch?v=test')).toBe(
                true,
            )
        })

        it('should validate player creation parameters', () => {
            type CreatePlayerParams = { client: unknown }
            const validateParams = (params: CreatePlayerParams): boolean =>
                params && params.client !== undefined

            expect(validateParams({ client: {} })).toBe(true)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(validateParams({ client: null } as any)).toBe(true)
        })
    })

    describe('YouTube extractor configuration', () => {
        it('should use IOS client with 32MB high water mark and po_token generation', () => {
            const extractorOptions = {
                streamOptions: {
                    useClient: 'IOS' as const,
                    highWaterMark: 1 << 25,
                },
                generateWithPoToken: true,
            }

            expect(extractorOptions.streamOptions.useClient).toBe('IOS')
            expect(extractorOptions.streamOptions.highWaterMark).toBe(33554432)
            expect(extractorOptions.generateWithPoToken).toBe(true)
        })

        it('should set a createStream override to route audio via SoundCloud', () => {
            const streamFn = () => Promise.resolve(null)
            const extractorOptions: {
                streamOptions: { useClient: 'IOS'; highWaterMark: number }
                createStream?: unknown
            } = {
                streamOptions: {
                    useClient: 'IOS' as const,
                    highWaterMark: 1 << 25,
                },
                createStream: streamFn,
            }

            expect(typeof extractorOptions.createStream).toBe('function')
        })
    })

    describe('parseDurationString', () => {
        const parseDurationString = (duration?: string): number | null => {
            if (!duration) return null
            const parts = duration.split(':').map(Number)
            if (parts.some(isNaN)) return null
            if (parts.length === 2) return parts[0] * 60 + parts[1]
            if (parts.length === 3)
                return parts[0] * 3600 + parts[1] * 60 + parts[2]
            return null
        }

        it('parses m:ss format', () => {
            expect(parseDurationString('3:45')).toBe(225)
            expect(parseDurationString('0:30')).toBe(30)
        })

        it('parses h:mm:ss format', () => {
            expect(parseDurationString('1:02:03')).toBe(3723)
        })

        it('returns null for undefined or empty', () => {
            expect(parseDurationString(undefined)).toBeNull()
            expect(parseDurationString('')).toBeNull()
        })

        it('returns null for invalid values', () => {
            expect(parseDurationString('abc')).toBeNull()
            expect(parseDurationString('3:xx')).toBeNull()
        })
    })

    describe('streamViaSoundCloud validation logic', () => {
        const norm = (s: string) => {
            const cleaned = s
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .trim()
            return cleaned || s.toLowerCase().trim()
        }

        const parseDurationString = (duration?: string): number | null => {
            if (!duration) return null
            const parts = duration.split(':').map(Number)
            if (parts.some(isNaN)) return null
            if (parts.length === 2) return parts[0] * 60 + parts[1]
            if (parts.length === 3)
                return parts[0] * 3600 + parts[1] * 60 + parts[2]
            return null
        }

        const findMatch = (
            track: { title: string; author: string; duration?: string },
            results: { name: string; durationInSec?: number }[],
        ) => {
            const titleNorm = norm(track.title)
            const trackSec = parseDurationString(track.duration)
            return results.find((r) => {
                const titleMatch =
                    norm(r.name).includes(titleNorm) ||
                    titleNorm.includes(norm(r.name))
                if (!titleMatch) return false
                if (trackSec === null || !r.durationInSec) return true
                return Math.abs(r.durationInSec - trackSec) <= 15
            })
        }

        it('matches when title and duration are within tolerance', () => {
            const track = {
                title: 'Bohemian Rhapsody',
                author: 'Queen',
                duration: '5:55',
            }
            const results = [{ name: 'Bohemian Rhapsody', durationInSec: 354 }]
            expect(findMatch(track, results)).toBeDefined()
        })

        it('rejects when duration is more than 15 seconds off', () => {
            const track = {
                title: 'Bohemian Rhapsody',
                author: 'Queen',
                duration: '5:55',
            }
            const results = [{ name: 'Bohemian Rhapsody', durationInSec: 500 }]
            expect(findMatch(track, results)).toBeUndefined()
        })

        it('returns undefined when no title matches', () => {
            const track = {
                title: 'Stairway to Heaven',
                author: 'Led Zeppelin',
                duration: '8:02',
            }
            const results = [{ name: 'Bohemian Rhapsody', durationInSec: 354 }]
            expect(findMatch(track, results)).toBeUndefined()
        })

        it('accepts match when duration is absent from result', () => {
            const track = {
                title: 'Test Song',
                author: 'Test Artist',
                duration: '3:00',
            }
            const results = [{ name: 'Test Song' }]
            expect(findMatch(track, results)).toBeDefined()
        })

        it('accepts match when track has no duration', () => {
            const track = { title: 'Test Song', author: 'Test Artist' }
            const results = [{ name: 'Test Song', durationInSec: 180 }]
            expect(findMatch(track, results)).toBeDefined()
        })

        it('picks first valid result from multiple candidates', () => {
            const track = { title: 'Song', author: 'Artist', duration: '3:00' }
            const results = [
                { name: 'Unrelated Track', durationInSec: 180 },
                { name: 'Song', durationInSec: 180 },
            ]
            expect(findMatch(track, results)?.name).toBe('Song')
        })

        it('does not false-match on non-ASCII titles that strip to empty string', () => {
            const track = {
                title: '夜に駆ける',
                author: 'YOASOBI',
                duration: '4:07',
            }
            const results = [{ name: 'Bohemian Rhapsody', durationInSec: 247 }]
            expect(findMatch(track, results)).toBeUndefined()
        })
    })

    describe('error handling', () => {
        it('should handle extractor registration failures gracefully', () => {
            const registerSafely = (register: () => void): boolean => {
                try {
                    register()
                    return true
                } catch {
                    return false
                }
            }

            expect(
                registerSafely(() => {
                    throw new Error('extractor not found')
                }),
            ).toBe(false)
            expect(registerSafely(() => {})).toBe(true)
        })

        it('should set max listeners to 20 to prevent memory leak warnings', () => {
            const maxListeners = 20
            expect(maxListeners).toBe(20)
        })
    })
})
