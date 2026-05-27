import { describe, expect, it } from '@jest/globals'
import { detectSessionMood, type SessionMood } from './sessionMood'

describe('sessionMood', () => {
    describe('detectSessionMood - artist deep-dive', () => {
        it.each([
            ['3+ times', 'artist a'],
            ['case-insensitive', 'artist a'],
            ['< 3 times', null],
        ])('%s → %s', (scenario, expected) => {
            const configs = {
                '3+ times': [
                    {
                        author: 'Artist A',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'Artist A',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'Artist B',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'Artist A',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'Artist C',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                ],
                'case-insensitive': [
                    {
                        author: 'ARTIST A',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'Artist A',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'artist a',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                ],
                '< 3 times': [
                    {
                        author: 'Artist A',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'Artist B',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                    {
                        author: 'Artist C',
                        durationMS: 200000,
                        isAutoplay: false,
                    },
                ],
            }
            const mood = detectSessionMood(
                configs[scenario as keyof typeof configs],
            )
            expect(mood.deepDiveArtist).toBe(expected)
        })

        it('checks only last 8 tracks', () => {
            const history = [
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'Z', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'C', durationMS: 200000, isAutoplay: false },
                { author: 'C', durationMS: 200000, isAutoplay: false },
                { author: 'C', durationMS: 200000, isAutoplay: false },
                { author: 'Y', durationMS: 200000, isAutoplay: false },
                { author: 'Y', durationMS: 200000, isAutoplay: false },
            ]

            expect(detectSessionMood(history).deepDiveArtist).toBe('artist a')
        })
    })

    describe('detectSessionMood - duration preferences', () => {
        it.each([
            ['long > 5min', true, false],
            ['short < 2.5min', false, true],
            ['neutral 2.5–5min', false, false],
        ])('%s', (_, expectedLong, expectedShort) => {
            const tracks = {
                'long > 5min': [
                    { author: 'A', durationMS: 400000, isAutoplay: false },
                    { author: 'B', durationMS: 380000, isAutoplay: false },
                    { author: 'C', durationMS: 360000, isAutoplay: false },
                    { author: 'D', durationMS: 420000, isAutoplay: false },
                    { author: 'E', durationMS: 350000, isAutoplay: false },
                ],
                'short < 2.5min': [
                    { author: 'A', durationMS: 120000, isAutoplay: false },
                    { author: 'B', durationMS: 90000, isAutoplay: false },
                    { author: 'C', durationMS: 110000, isAutoplay: false },
                    { author: 'D', durationMS: 100000, isAutoplay: false },
                    { author: 'E', durationMS: 80000, isAutoplay: false },
                ],
                'neutral 2.5–5min': [
                    { author: 'A', durationMS: 200000, isAutoplay: false },
                    { author: 'B', durationMS: 220000, isAutoplay: false },
                    { author: 'C', durationMS: 210000, isAutoplay: false },
                    { author: 'D', durationMS: 240000, isAutoplay: false },
                    { author: 'E', durationMS: 230000, isAutoplay: false },
                ],
            }
            const mood = detectSessionMood(tracks[_ as keyof typeof tracks])
            expect(mood.preferLong).toBe(expectedLong)
            expect(mood.preferShort).toBe(expectedShort)
        })

        it('parses duration strings (m:ss and h:mm:ss)', () => {
            const mss = [
                { author: 'A', duration: '6:40', isAutoplay: false },
                { author: 'B', duration: '6:20', isAutoplay: false },
                { author: 'C', duration: '6:00', isAutoplay: false },
                { author: 'D', duration: '7:00', isAutoplay: false },
                { author: 'E', duration: '5:50', isAutoplay: false },
            ]
            expect(detectSessionMood(mss).preferLong).toBe(true)

            const hms = [
                { author: 'A', duration: '1:03:20', isAutoplay: false },
                { author: 'B', duration: '1:05:00', isAutoplay: false },
                { author: 'C', duration: '1:00:00', isAutoplay: false },
                { author: 'D', duration: '1:10:00', isAutoplay: false },
                { author: 'E', duration: '0:58:00', isAutoplay: false },
            ]
            expect(detectSessionMood(hms).preferLong).toBe(true)
        })

        it('filters 0/undefined durations and handles edge cases', () => {
            // Ignores 0 and undefined
            const mixed = [
                { author: 'A', durationMS: 400000, isAutoplay: false },
                { author: 'B', durationMS: 0, isAutoplay: false },
                { author: 'C', durationMS: 380000, isAutoplay: false },
                { author: 'D', durationMS: 420000, isAutoplay: false },
                { author: 'E', durationMS: undefined, isAutoplay: false },
            ]
            expect(detectSessionMood(mixed).preferLong).toBe(true)

            // No valid durations
            const empty = [{ author: 'A', durationMS: 0, isAutoplay: false }]
            const mood = detectSessionMood(empty)
            expect(mood.preferLong).toBe(false)
            expect(mood.preferShort).toBe(false)
        })
    })

    describe('detectSessionMood - restless mode', () => {
        it.each([
            ['>40% + 3+ artists', true],
            ['exactly 40% (boundary)', false],
            ['<3 unique artists', false],
        ])('restless: %s → %s', (scenario, expected) => {
            const configs = {
                '>40% + 3+ artists': [
                    { author: 'A', durationMS: 200000, isAutoplay: false },
                    { author: 'B', durationMS: 200000, isAutoplay: true },
                    { author: 'C', durationMS: 200000, isAutoplay: true },
                    { author: 'D', durationMS: 200000, isAutoplay: true },
                    { author: 'E', durationMS: 200000, isAutoplay: false },
                ],
                'exactly 40% (boundary)': [
                    { author: 'A', durationMS: 200000, isAutoplay: false },
                    { author: 'B', durationMS: 200000, isAutoplay: false },
                    { author: 'C', durationMS: 200000, isAutoplay: false },
                    { author: 'D', durationMS: 200000, isAutoplay: true },
                    { author: 'E', durationMS: 200000, isAutoplay: true },
                ],
                '<3 unique artists': [
                    { author: 'A', durationMS: 200000, isAutoplay: false },
                    { author: 'A', durationMS: 200000, isAutoplay: true },
                    { author: 'A', durationMS: 200000, isAutoplay: true },
                    { author: 'B', durationMS: 200000, isAutoplay: true },
                    { author: 'B', durationMS: 200000, isAutoplay: true },
                ],
            }
            const mood = detectSessionMood(
                configs[scenario as keyof typeof configs],
            )
            expect(mood.restless).toBe(expected)
        })

        it('requires 5+ tracks and checks last 10', () => {
            // <5 tracks = false
            const short = [
                { author: 'A', durationMS: 200000, isAutoplay: false },
                { author: 'B', durationMS: 200000, isAutoplay: true },
                { author: 'C', durationMS: 200000, isAutoplay: true },
            ]
            expect(detectSessionMood(short).restless).toBe(false)

            // Window test: ignore old, check last 10
            const old = [
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
                { author: 'X', durationMS: 200000, isAutoplay: false },
            ]
            const recent = [
                { author: 'A', durationMS: 200000, isAutoplay: false },
                { author: 'B', durationMS: 200000, isAutoplay: true },
                { author: 'C', durationMS: 200000, isAutoplay: true },
                { author: 'D', durationMS: 200000, isAutoplay: true },
                { author: 'E', durationMS: 200000, isAutoplay: true },
                { author: 'F', durationMS: 200000, isAutoplay: true },
                { author: 'G', durationMS: 200000, isAutoplay: true },
                { author: 'H', durationMS: 200000, isAutoplay: false },
                { author: 'I', durationMS: 200000, isAutoplay: false },
                { author: 'J', durationMS: 200000, isAutoplay: false },
            ]
            expect(detectSessionMood([...old, ...recent]).restless).toBe(true)
        })
    })

    describe('edge cases', () => {
        it('returns all false/null for empty history', () => {
            const mood = detectSessionMood([])

            expect(mood).toEqual({
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: false,
                dominantLocale: null,
                recentSkipCount: 0,
            })
        })

        it('handles missing fields and combines signals', () => {
            // No author field
            const noAuthor = [
                { durationMS: 200000, isAutoplay: false },
                { durationMS: 200000, isAutoplay: false },
                { durationMS: 200000, isAutoplay: false },
            ]
            expect(detectSessionMood(noAuthor).deepDiveArtist).toBeNull()

            // Combined signals: deepDive + long + restless
            const combo = [
                { author: 'Artist A', duration: '6:00', isAutoplay: false },
                { author: 'Artist A', duration: '6:30', isAutoplay: true },
                { author: 'Artist A', duration: '5:45', isAutoplay: true },
                { author: 'Artist B', duration: '7:00', isAutoplay: true },
                { author: 'Artist C', duration: '6:15', isAutoplay: true },
            ]
            const mood = detectSessionMood(combo)
            expect(mood.deepDiveArtist).toBe('artist a')
            expect(mood.preferLong).toBe(true)
            expect(mood.restless).toBe(true)
        })

        it('handles malformed durations and case-insensitive artists', () => {
            // Malformed durations: 'invalid' and ''
            const malformed = [
                { author: 'A', duration: 'invalid', isAutoplay: false },
                { author: 'B', duration: '6:00', isAutoplay: false },
                { author: 'C', duration: '6:30', isAutoplay: false },
                { author: 'D', duration: '7:00', isAutoplay: false },
                { author: 'E', duration: '', isAutoplay: false },
            ]
            expect(detectSessionMood(malformed).preferLong).toBe(true)

            // Case-insensitive artist dedup for restless
            const caseTest = [
                { author: 'artist A', durationMS: 200000, isAutoplay: false },
                { author: 'ARTIST A', durationMS: 200000, isAutoplay: true },
                { author: 'Artist B', durationMS: 200000, isAutoplay: true },
                { author: 'ARTIST C', durationMS: 200000, isAutoplay: true },
                { author: 'artist d', durationMS: 200000, isAutoplay: true },
            ]
            expect(detectSessionMood(caseTest).restless).toBe(true)
        })
    })

    describe('detectSessionMood - dominantLocale', () => {
        it.each([
            ['no markers', null],
            ['reggaeton/cumbia', 'spanish'],
            ['case-insensitive', 'spanish'],
        ])('%s → %s', (scenario, expected) => {
            const tracks = {
                'no markers': [
                    {
                        author: 'Beatles',
                        title: 'Hey Jude',
                        durationMS: 200000,
                    },
                    {
                        author: 'Zeppelin',
                        title: 'Stairway',
                        durationMS: 480000,
                    },
                ],
                'reggaeton/cumbia': [
                    {
                        author: 'Bad Bunny',
                        title: 'Reggaeton mix',
                        durationMS: 200000,
                    },
                    {
                        author: 'X',
                        title: 'Cumbia caliente',
                        durationMS: 200000,
                    },
                ],
                'case-insensitive': [
                    {
                        author: 'Artist',
                        title: 'BACHATA hits',
                        durationMS: 200000,
                    },
                ],
            }
            const mood = detectSessionMood(
                tracks[scenario as keyof typeof tracks],
            )
            expect(mood.dominantLocale).toBe(expected)
        })

        it('detects from author field and respects 15-track window', () => {
            // Banda MS in author field
            const author = [
                { author: 'Banda MS', title: 'Mi razón', durationMS: 200000 },
            ]
            expect(detectSessionMood(author).dominantLocale).toBe('spanish')

            // Outside 15-track window
            const old = Array.from({ length: 5 }, () => ({
                author: 'Bad Bunny',
                title: 'Reggaeton hit',
                durationMS: 200000,
            }))
            const recent = Array.from({ length: 15 }, (_, i) => ({
                author: `Artist ${i}`,
                title: `Song ${i}`,
                durationMS: 200000,
            }))
            expect(
                detectSessionMood([...old, ...recent]).dominantLocale,
            ).toBeNull()
        })
    })

    describe('detectSessionMood - recentSkipCount', () => {
        it('skipCount >= 3 forces restless=true (overrides organic signals)', () => {
            const history = Array.from({ length: 5 }, (_, i) => ({
                author: `Artist ${i}`,
                durationMS: 200000,
            }))

            expect(detectSessionMood(history, 3).restless).toBe(true)
            expect(detectSessionMood(history, 5).restless).toBe(true)
            expect(detectSessionMood(history, 2).restless).toBe(false)

            // skipCount overrides: same artist but high skip count
            const same = Array.from({ length: 5 }, () => ({
                author: 'Same Artist',
                durationMS: 200000,
            }))
            expect(detectSessionMood(same, 3).restless).toBe(true)
        })
    })
})
