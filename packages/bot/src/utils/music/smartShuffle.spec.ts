import { type Track } from 'discord-player'
import { smartShuffle } from './smartShuffle'

function makeTrack(overrides: {
    id: string
    source?: string
    durationMS?: number
    userId?: string
}): Track {
    return {
        id: overrides.id,
        source: overrides.source ?? 'soundcloud',
        durationMS: overrides.durationMS ?? 200_000,
        requestedBy: overrides.userId ? { id: overrides.userId } : undefined,
    } as unknown as Track
}

describe('smartShuffle', () => {
    it('returns empty array for empty input', () => {
        expect(smartShuffle([])).toEqual([])
    })

    it('returns single-track array unchanged', () => {
        const track = makeTrack({ id: 'a' })
        expect(smartShuffle([track])).toEqual([track])
    })

    it('returns all tracks — no tracks are lost', () => {
        const tracks = [
            makeTrack({ id: '1', source: 'spotify', durationMS: 180_000 }),
            makeTrack({ id: '2', source: 'youtube', durationMS: 500_000 }),
            makeTrack({ id: '3', source: 'spotify', durationMS: 400_000 }),
            makeTrack({ id: '4', source: 'apple_music', durationMS: 100_000 }),
            makeTrack({ id: '5', source: 'soundcloud', durationMS: 300_000 }),
        ]

        const result = smartShuffle(tracks, { seed: 42 })

        expect(result).toHaveLength(5)
        expect(result.map((t) => t.id).sort()).toEqual(['1', '2', '3', '4', '5'])
    })

    it('is deterministic given the same seed', () => {
        const tracks = [
            makeTrack({ id: '1', source: 'spotify', durationMS: 180_000 }),
            makeTrack({ id: '2', source: 'youtube', durationMS: 500_000 }),
            makeTrack({ id: '3', source: 'apple_music', durationMS: 100_000 }),
            makeTrack({ id: '4', source: 'youtube', durationMS: 300_000 }),
            makeTrack({ id: '5', source: 'soundcloud', durationMS: 200_000 }),
        ]

        const first = smartShuffle(tracks, { seed: 99 })
        const second = smartShuffle(tracks, { seed: 99 })

        expect(first.map((t) => t.id)).toEqual(second.map((t) => t.id))
    })

    it('property: same-requester streak never exceeds streakLimit', () => {
        const STREAK_LIMIT = 2
        const tracks = [
            makeTrack({ id: '1', userId: 'userA' }),
            makeTrack({ id: '2', userId: 'userA' }),
            makeTrack({ id: '3', userId: 'userA' }),
            makeTrack({ id: '4', userId: 'userB' }),
            makeTrack({ id: '5', userId: 'userB' }),
            makeTrack({ id: '6', userId: 'userB' }),
            makeTrack({ id: '7', userId: 'userA' }),
        ]

        const result = smartShuffle(tracks, { seed: 1, streakLimit: STREAK_LIMIT })

        let streak = 1
        let maxStreak = 1
        for (let i = 1; i < result.length; i++) {
            const prev = (result[i - 1] as any).requestedBy?.id
            const curr = (result[i] as any).requestedBy?.id
            if (curr && curr === prev) {
                streak++
                maxStreak = Math.max(maxStreak, streak)
            } else {
                streak = 1
            }
        }

        expect(maxStreak).toBeLessThanOrEqual(STREAK_LIMIT)
    })

    it('property: streak limit=1 enforces strict alternation between two users when possible', () => {
        const tracks = [
            makeTrack({ id: '1', userId: 'A' }),
            makeTrack({ id: '2', userId: 'A' }),
            makeTrack({ id: '3', userId: 'B' }),
            makeTrack({ id: '4', userId: 'B' }),
        ]

        const result = smartShuffle(tracks, { seed: 7, streakLimit: 1 })

        for (let i = 1; i < result.length; i++) {
            const prev = (result[i - 1] as any).requestedBy?.id
            const curr = (result[i] as any).requestedBy?.id
            if (prev === curr) {
                const remaining = result.slice(i)
                const hasAlternate = remaining.some(
                    (t) => (t as any).requestedBy?.id !== prev,
                )
                expect(hasAlternate).toBe(false)
            }
        }
    })

    it('high-energy spotify tracks appear before low-energy long tracks in output', () => {
        const highA = makeTrack({ id: 'high-a', source: 'spotify', durationMS: 180_000 })
        const highB = makeTrack({ id: 'high-b', source: 'spotify', durationMS: 200_000 })
        const lowA = makeTrack({ id: 'low-a', source: 'spotify', durationMS: 400_000 })

        const result = smartShuffle([lowA, highA, highB], { seed: 3 })

        const lowIdx = result.findIndex((t) => t.id === 'low-a')
        const highAIdx = result.findIndex((t) => t.id === 'high-a')
        const highBIdx = result.findIndex((t) => t.id === 'high-b')

        expect(highAIdx).toBeLessThan(lowIdx)
        expect(highBIdx).toBeLessThan(lowIdx)
    })

    it('snapshot: known input → stable output with seed=42', () => {
        const tracks = [
            makeTrack({ id: 'yt-long', source: 'youtube', durationMS: 500_000, userId: 'u1' }),
            makeTrack({ id: 'sp-short', source: 'spotify', durationMS: 150_000, userId: 'u2' }),
            makeTrack({ id: 'sp-mid', source: 'spotify', durationMS: 300_000, userId: 'u1' }),
            makeTrack({ id: 'am-short', source: 'apple_music', durationMS: 100_000, userId: 'u2' }),
            makeTrack({ id: 'sc-mid', source: 'soundcloud', durationMS: 250_000, userId: 'u3' }),
        ]

        const result = smartShuffle(tracks, { seed: 42, streakLimit: 2 })

        expect(result.map((t) => t.id)).toMatchSnapshot()
    })
})
