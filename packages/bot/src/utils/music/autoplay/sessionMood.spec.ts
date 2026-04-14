import { detectSessionMood, type SessionMood } from './sessionMood'

describe('sessionMood', () => {
    describe('detectSessionMood - artist deep-dive', () => {
        it('detects same artist 3+ times in last 8 tracks', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist B', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist C', durationMS: 200000, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.deepDiveArtist).toBe('artist a')
        })

        it('uses case-insensitive matching for artist names', () => {
            const history = [
                { author: 'ARTIST A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'artist a', durationMS: 200000, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.deepDiveArtist).toBe('artist a')
        })

        it('returns null when no artist appears 3+ times', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist B', durationMS: 200000, isAutoplay: false },
                { author: 'Artist C', durationMS: 200000, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.deepDiveArtist).toBeNull()
        })

        it('only checks last 8 tracks for deep-dive detection', () => {
            const history = [
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist Z', durationMS: 200000, isAutoplay: false },
                // Last 8 start here:
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist C', durationMS: 200000, isAutoplay: false },
                { author: 'Artist C', durationMS: 200000, isAutoplay: false },
                { author: 'Artist C', durationMS: 200000, isAutoplay: false },
                { author: 'Artist Y', durationMS: 200000, isAutoplay: false },
                { author: 'Artist Y', durationMS: 200000, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.deepDiveArtist).toBe('artist a')
        })
    })

    describe('detectSessionMood - duration preferences', () => {
        it('detects long-form listening when avg duration > 5min', () => {
            const history = [
                { author: 'Artist A', durationMS: 400000, isAutoplay: false }, // 6:40
                { author: 'Artist B', durationMS: 380000, isAutoplay: false }, // 6:20
                { author: 'Artist C', durationMS: 360000, isAutoplay: false }, // 6:00
                { author: 'Artist D', durationMS: 420000, isAutoplay: false }, // 7:00
                { author: 'Artist E', durationMS: 350000, isAutoplay: false }, // 5:50
            ]

            const mood = detectSessionMood(history)

            expect(mood.preferLong).toBe(true)
            expect(mood.preferShort).toBe(false)
        })

        it('detects quick-hit mode when avg duration < 2.5min', () => {
            const history = [
                { author: 'Artist A', durationMS: 120000, isAutoplay: false }, // 2:00
                { author: 'Artist B', durationMS: 90000, isAutoplay: false }, // 1:30
                { author: 'Artist C', durationMS: 110000, isAutoplay: false }, // 1:50
                { author: 'Artist D', durationMS: 100000, isAutoplay: false }, // 1:40
                { author: 'Artist E', durationMS: 80000, isAutoplay: false }, // 1:20
            ]

            const mood = detectSessionMood(history)

            expect(mood.preferShort).toBe(true)
            expect(mood.preferLong).toBe(false)
        })

        it('prefers neither when avg duration is between 2.5 and 5 min', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000, isAutoplay: false }, // 3:20
                { author: 'Artist B', durationMS: 220000, isAutoplay: false }, // 3:40
                { author: 'Artist C', durationMS: 210000, isAutoplay: false }, // 3:30
                { author: 'Artist D', durationMS: 240000, isAutoplay: false }, // 4:00
                { author: 'Artist E', durationMS: 230000, isAutoplay: false }, // 3:50
            ]

            const mood = detectSessionMood(history)

            expect(mood.preferLong).toBe(false)
            expect(mood.preferShort).toBe(false)
        })

        it('handles duration string format (m:ss)', () => {
            const history = [
                { author: 'Artist A', duration: '6:40', isAutoplay: false },
                { author: 'Artist B', duration: '6:20', isAutoplay: false },
                { author: 'Artist C', duration: '6:00', isAutoplay: false },
                { author: 'Artist D', duration: '7:00', isAutoplay: false },
                { author: 'Artist E', duration: '5:50', isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.preferLong).toBe(true)
        })

        it('handles duration string format (h:mm:ss)', () => {
            const history = [
                { author: 'Artist A', duration: '1:03:20', isAutoplay: false }, // 3800000ms
                { author: 'Artist B', duration: '1:05:00', isAutoplay: false }, // 3900000ms
                { author: 'Artist C', duration: '1:00:00', isAutoplay: false }, // 3600000ms
                { author: 'Artist D', duration: '1:10:00', isAutoplay: false }, // 4200000ms
                { author: 'Artist E', duration: '0:58:00', isAutoplay: false }, // 3480000ms
            ]

            const mood = detectSessionMood(history)

            expect(mood.preferLong).toBe(true)
        })

        it('ignores tracks with 0 duration', () => {
            const history = [
                { author: 'Artist A', durationMS: 400000, isAutoplay: false },
                { author: 'Artist B', durationMS: 0, isAutoplay: false },
                { author: 'Artist C', durationMS: 380000, isAutoplay: false },
                { author: 'Artist D', durationMS: 420000, isAutoplay: false },
                { author: 'Artist E', durationMS: undefined, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.preferLong).toBe(true)
        })

        it('requires at least 1 track with valid duration for duration check', () => {
            const history = [{ author: 'Artist A', durationMS: 0, isAutoplay: false }]

            const mood = detectSessionMood(history)

            expect(mood.preferLong).toBe(false)
            expect(mood.preferShort).toBe(false)
        })
    })

    describe('detectSessionMood - restless mode', () => {
        it('detects restless mode with >40% autoplay and 3+ different artists', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist B', durationMS: 200000, isAutoplay: true },
                { author: 'Artist C', durationMS: 200000, isAutoplay: true },
                { author: 'Artist D', durationMS: 200000, isAutoplay: true },
                { author: 'Artist E', durationMS: 200000, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.restless).toBe(true)
        })

        it('requires >40% autoplay (exactly 40% should be false)', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist B', durationMS: 200000, isAutoplay: false },
                { author: 'Artist C', durationMS: 200000, isAutoplay: false },
                { author: 'Artist D', durationMS: 200000, isAutoplay: true },
                { author: 'Artist E', durationMS: 200000, isAutoplay: true },
            ]

            const mood = detectSessionMood(history)

            expect(mood.restless).toBe(false)
        })

        it('requires at least 3 different artists for restless mode', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist A', durationMS: 200000, isAutoplay: true },
                { author: 'Artist A', durationMS: 200000, isAutoplay: true },
                { author: 'Artist B', durationMS: 200000, isAutoplay: true },
                { author: 'Artist B', durationMS: 200000, isAutoplay: true },
            ]

            const mood = detectSessionMood(history)

            expect(mood.restless).toBe(false)
        })

        it('requires at least 5 tracks in recent history for restless check', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist B', durationMS: 200000, isAutoplay: true },
                { author: 'Artist C', durationMS: 200000, isAutoplay: true },
            ]

            const mood = detectSessionMood(history)

            expect(mood.restless).toBe(false)
        })

        it('checks last 10 tracks for restless detection', () => {
            const history = [
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                { author: 'Artist X', durationMS: 200000, isAutoplay: false },
                // Last 10 below
                { author: 'Artist A', durationMS: 200000, isAutoplay: false },
                { author: 'Artist B', durationMS: 200000, isAutoplay: true },
                { author: 'Artist C', durationMS: 200000, isAutoplay: true },
                { author: 'Artist D', durationMS: 200000, isAutoplay: true },
                { author: 'Artist E', durationMS: 200000, isAutoplay: true },
                { author: 'Artist F', durationMS: 200000, isAutoplay: true },
                { author: 'Artist G', durationMS: 200000, isAutoplay: true },
                { author: 'Artist H', durationMS: 200000, isAutoplay: false },
                { author: 'Artist I', durationMS: 200000, isAutoplay: false },
                { author: 'Artist J', durationMS: 200000, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.restless).toBe(true)
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
            })
        })

        it('handles missing author field gracefully', () => {
            const history = [
                { durationMS: 200000, isAutoplay: false },
                { durationMS: 200000, isAutoplay: false },
                { durationMS: 200000, isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.deepDiveArtist).toBeNull()
        })

        it('handles missing isAutoplay field (defaults to false)', () => {
            const history = [
                { author: 'Artist A', durationMS: 200000 },
                { author: 'Artist A', durationMS: 200000 },
                { author: 'Artist A', durationMS: 200000 },
            ]

            const mood = detectSessionMood(history)

            expect(mood.deepDiveArtist).toBe('artist a')
            expect(mood.restless).toBe(false)
        })

        it('combines multiple mood signals correctly', () => {
            const history = [
                { author: 'Artist A', duration: '6:00', isAutoplay: false },
                { author: 'Artist A', duration: '6:30', isAutoplay: true },
                { author: 'Artist A', duration: '5:45', isAutoplay: true },
                { author: 'Artist B', duration: '7:00', isAutoplay: true },
                { author: 'Artist C', duration: '6:15', isAutoplay: true },
            ]

            const mood = detectSessionMood(history)

            expect(mood.deepDiveArtist).toBe('artist a')
            expect(mood.preferLong).toBe(true)
            expect(mood.preferShort).toBe(false)
            expect(mood.restless).toBe(true)
        })

        it('handles malformed duration strings', () => {
            const history = [
                { author: 'Artist A', duration: 'invalid', isAutoplay: false },
                { author: 'Artist B', duration: '6:00', isAutoplay: false },
                { author: 'Artist C', duration: '6:30', isAutoplay: false },
                { author: 'Artist D', duration: '7:00', isAutoplay: false },
                { author: 'Artist E', duration: '', isAutoplay: false },
            ]

            const mood = detectSessionMood(history)

            expect(mood.preferLong).toBe(true)
        })

        it('case-insensitive artist deduplication for restless check', () => {
            const history = [
                { author: 'artist A', durationMS: 200000, isAutoplay: false },
                { author: 'ARTIST A', durationMS: 200000, isAutoplay: true },
                { author: 'Artist B', durationMS: 200000, isAutoplay: true },
                { author: 'ARTIST C', durationMS: 200000, isAutoplay: true },
                { author: 'artist d', durationMS: 200000, isAutoplay: true },
            ]

            const mood = detectSessionMood(history)

            expect(mood.restless).toBe(true)
        })
    })
})
