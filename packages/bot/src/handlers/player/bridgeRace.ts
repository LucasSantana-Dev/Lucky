import { AsyncLocalStorage } from 'node:async_hooks'
import type { Readable } from 'node:stream'
import { debugLog } from '@lucky/shared/utils'

// First-answer-wins race between bridge stages (#2871). Each arm resolves a
// stream or null (the stage convention: a failed stage returns null). The
// first arm to hand back a stream wins; every later stream is destroyed, which
// is what stops its yt-dlp child (ytdlpProcess kills the child when the
// stream closes). An arm that has not answered yet cannot be interrupted: it
// runs to its own stage budget and is cleaned up when it settles.

type RaceState = { winner: symbol | null }
type ArmScope = { race: RaceState; arm: symbol }

const armScope = new AsyncLocalStorage<ArmScope>()

/**
 * Stage side effects that describe the played source (the Spotify resolution
 * cache, the Now Playing stamp) go through this. Outside a race it is always
 * true. Inside one, the first arm to ask becomes the winner, and an arm that
 * lost gets false, so it cannot overwrite what the winner recorded.
 */
export function claimStageResult(): boolean {
    const scope = armScope.getStore()
    if (!scope) return true
    return claimFor(scope.race, scope.arm)
}

function claimFor(race: RaceState, arm: symbol): boolean {
    if (race.winner === null) race.winner = arm
    return race.winner === arm
}

/** True inside an arm whose race another arm has already won. */
export function raceWonByAnotherArm(): boolean {
    const scope = armScope.getStore()
    if (!scope) return false
    const { winner } = scope.race
    return winner !== null && winner !== scope.arm
}

function discardStream(stream: Readable): void {
    // A stream torn down mid-pipe can still emit 'error'; with no listener
    // that would be an uncaught exception.
    stream.on('error', () => {})
    stream.destroy()
}

export type RaceArm = {
    name: string
    run: () => Promise<Readable | null>
}

/**
 * Runs the arms at once and resolves with the first stream. Resolves null
 * when every arm came back empty, and rejects with the first thrown error
 * when no arm produced a stream and one threw (the sequential flow it
 * replaces let that error propagate). An error from an arm after a winner
 * exists is dropped.
 */
export function raceStreams(arms: RaceArm[]): Promise<Readable | null> {
    const race: RaceState = { winner: null }
    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
        let pending = arms.length
        let decided = false
        let failure: { error: unknown } | null = null

        const armSettled = () => {
            pending -= 1
            if (pending > 0 || decided) return
            decided = true
            if (failure) reject(failure.error)
            else resolve(null)
        }

        for (const { name, run } of arms) {
            const arm = Symbol(name)
            armScope.run({ race, arm }, run).then(
                (stream) => {
                    if (stream && !decided && claimFor(race, arm)) {
                        decided = true
                        debugLog({
                            message: 'Bridge: race decided',
                            data: {
                                winner: name,
                                durationMs: Date.now() - startedAt,
                            },
                        })
                        resolve(stream)
                        return
                    }
                    // An arm that claimed the win and came back empty frees it.
                    if (!stream && race.winner === arm) race.winner = null
                    if (stream) {
                        debugLog({
                            message:
                                'Bridge: race loser answered, stream discarded',
                            data: { loser: name },
                        })
                        discardStream(stream)
                    }
                    armSettled()
                },
                (error: unknown) => {
                    // An arm that claimed the win and then threw frees it.
                    if (race.winner === arm) race.winner = null
                    if (!failure) failure = { error }
                    armSettled()
                },
            )
        }
    })
}
