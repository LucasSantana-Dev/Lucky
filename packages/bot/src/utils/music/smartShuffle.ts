import type { Track } from 'discord-player'

const STREAK_LIMIT = Number.parseInt(
    process.env.QUEUE_SMART_SHUFFLE_STREAK_LIMIT ?? '2',
    10,
)

type EnergyLevel = 'high' | 'medium' | 'low'
const ENERGY_ORDER: EnergyLevel[] = ['high', 'medium', 'low']

export type SmartShuffleOptions = {
    streakLimit?: number
    seed?: number
}

type ScoredTrack = {
    track: Track
    energy: EnergyLevel
    userId: string
}

function getEnergyLevel(track: Track): EnergyLevel {
    const source = track.source
    const durationS = (track.durationMS ?? 0) / 1000

    if (source === 'spotify' || source === 'apple_music') {
        if (durationS > 0 && durationS < 240) return 'high'
        if (durationS > 360) return 'low'
        return 'medium'
    }

    if (source === 'youtube') {
        if (durationS > 0 && durationS < 180) return 'high'
        if (durationS > 420) return 'low'
        return 'medium'
    }

    return 'medium'
}

function deterministicJitter(index: number, seed: number): number {
    const x = Math.sin(index * 9301 + seed * 49297) * 233280
    return (x - Math.floor(x)) * 0.05
}

export function smartShuffle(
    tracks: readonly Track[],
    opts: SmartShuffleOptions = {},
): Track[] {
    if (tracks.length <= 1) return [...tracks]

    const streakLimit = opts.streakLimit ?? STREAK_LIMIT
    const seed = opts.seed ?? Date.now()

    const scored: ScoredTrack[] = tracks.map((track) => ({
        track,
        energy: getEnergyLevel(track),
        userId: track.requestedBy?.id ?? 'autoplay',
    }))

    const groups: Record<EnergyLevel, ScoredTrack[]> = {
        high: scored.filter((s) => s.energy === 'high'),
        medium: scored.filter((s) => s.energy === 'medium'),
        low: scored.filter((s) => s.energy === 'low'),
    }

    const result: Track[] = []
    let lastUserId: string | null = null
    let currentStreak = 0
    let globalIndex = 0

    while (result.length < tracks.length) {
        let picked = false

        for (const energy of ENERGY_ORDER) {
            const pool = groups[energy]
            if (pool.length === 0) continue

            const candidates = pool.filter(
                (s) =>
                    currentStreak < streakLimit || s.userId !== lastUserId,
            )

            const source = candidates.length > 0 ? candidates : pool

            const window = source.slice(0, Math.min(3, source.length))
            const jitters = window.map((_, i) =>
                deterministicJitter(globalIndex + i, seed),
            )
            const chosenIdx = jitters.indexOf(Math.max(...jitters))
            const chosen = window[chosenIdx]
            if (!chosen) continue

            const poolIdx = pool.indexOf(chosen)
            pool.splice(poolIdx, 1)

            if (chosen.userId === lastUserId) {
                currentStreak++
            } else {
                lastUserId = chosen.userId
                currentStreak = 1
            }

            result.push(chosen.track)
            globalIndex++
            picked = true
            break
        }

        if (!picked) {
            for (const energy of ENERGY_ORDER) {
                const pool = groups[energy]
                if (pool.length > 0) {
                    result.push(pool.shift()!.track)
                    globalIndex++
                    break
                }
            }
        }
    }

    return result
}
