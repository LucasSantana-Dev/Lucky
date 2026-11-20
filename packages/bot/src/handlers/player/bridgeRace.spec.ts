import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'

const mockDebugLog = jest.fn()
jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => mockDebugLog(...args),
}))

import {
    claimStageResult,
    raceStreams,
    raceWonByAnotherArm,
} from './bridgeRace'

type Deferred = {
    promise: Promise<Readable | null>
    resolve: (value: Readable | null) => void
    reject: (error: unknown) => void
}

function deferred(): Deferred {
    let resolve!: Deferred['resolve']
    let reject!: Deferred['reject']
    const promise = new Promise<Readable | null>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('raceStreams', () => {
    const unhandled = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        process.on('unhandledRejection', unhandled)
    })

    afterEach(() => {
        process.off('unhandledRejection', unhandled)
    })

    it('resolves with the faster arm without waiting for the slower one', async () => {
        const slow = deferred()
        const fast = deferred()
        const winner = new PassThrough()
        const result = raceStreams([
            { name: 'slow', run: () => slow.promise },
            { name: 'fast', run: () => fast.promise },
        ])

        fast.resolve(winner)

        await expect(result).resolves.toBe(winner)
        expect(winner.destroyed).toBe(false)
        expect(mockDebugLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bridge: race decided',
                data: expect.objectContaining({ winner: 'fast' }),
            }),
        )
    })

    it('uses the other arm when the first to settle comes back empty', async () => {
        const first = deferred()
        const second = deferred()
        const stream = new PassThrough()
        const result = raceStreams([
            { name: 'first', run: () => first.promise },
            { name: 'second', run: () => second.promise },
        ])

        first.resolve(null)
        await flush()
        second.resolve(stream)

        await expect(result).resolves.toBe(stream)
    })

    it('uses the other arm when the first to settle throws', async () => {
        const first = deferred()
        const second = deferred()
        const stream = new PassThrough()
        const result = raceStreams([
            { name: 'first', run: () => first.promise },
            { name: 'second', run: () => second.promise },
        ])

        first.reject(new Error('yt-dlp: timed out'))
        await flush()
        second.resolve(stream)

        await expect(result).resolves.toBe(stream)
        await flush()
        expect(unhandled).not.toHaveBeenCalled()
    })

    it('resolves null once every arm came back empty', async () => {
        const result = raceStreams([
            { name: 'a', run: async () => null },
            { name: 'b', run: async () => null },
        ])

        await expect(result).resolves.toBeNull()
    })

    it('rejects with the arm error when no arm produced a stream', async () => {
        const boom = new Error('cache lookup blew up')
        const result = raceStreams([
            { name: 'a', run: async () => null },
            {
                name: 'b',
                run: async () => {
                    throw boom
                },
            },
        ])

        await expect(result).rejects.toBe(boom)
    })

    it('destroys a loser stream that arrives after the winner', async () => {
        const winnerArm = deferred()
        const loserArm = deferred()
        const winner = new PassThrough()
        const loser = new PassThrough()
        const result = raceStreams([
            { name: 'winner', run: () => winnerArm.promise },
            { name: 'loser', run: () => loserArm.promise },
        ])

        winnerArm.resolve(winner)
        await result
        loserArm.resolve(loser)
        await flush()

        expect(loser.destroyed).toBe(true)
        expect(winner.destroyed).toBe(false)
    })

    it('swallows an error the discarded stream emits while closing', async () => {
        const winnerArm = deferred()
        const loserArm = deferred()
        const loser = new PassThrough()
        const result = raceStreams([
            { name: 'winner', run: () => winnerArm.promise },
            { name: 'loser', run: () => loserArm.promise },
        ])

        winnerArm.resolve(new PassThrough())
        await result
        loserArm.resolve(loser)
        await flush()

        expect(() => loser.emit('error', new Error('EPIPE'))).not.toThrow()
    })

    it('drops an error thrown by a loser after the winner settled', async () => {
        const winnerArm = deferred()
        const loserArm = deferred()
        const result = raceStreams([
            { name: 'winner', run: () => winnerArm.promise },
            { name: 'loser', run: () => loserArm.promise },
        ])

        winnerArm.resolve(new PassThrough())
        await result
        loserArm.reject(new Error('late failure'))
        await flush()

        expect(unhandled).not.toHaveBeenCalled()
    })

    it('settles on one winner when both arms answer in the same tick', async () => {
        const a = new PassThrough()
        const b = new PassThrough()
        const result = raceStreams([
            { name: 'a', run: async () => a },
            { name: 'b', run: async () => b },
        ])

        const winner = await result
        await flush()

        expect(winner).toBe(a)
        expect(a.destroyed).toBe(false)
        expect(b.destroyed).toBe(true)
    })
})

describe('claimStageResult and raceWonByAnotherArm', () => {
    it('allow everything outside a race', () => {
        expect(claimStageResult()).toBe(true)
        expect(raceWonByAnotherArm()).toBe(false)
    })

    it('give the stage side effects to the first arm that claims and refuse the other', async () => {
        const early = deferred()
        const late = deferred()
        const seen: Record<string, boolean[]> = { early: [], late: [] }
        const result = raceStreams([
            {
                name: 'early',
                run: async () => {
                    seen.early.push(claimStageResult(), claimStageResult())
                    early.resolve(null)
                    return new PassThrough()
                },
            },
            {
                name: 'late',
                run: async () => {
                    await early.promise
                    seen.late.push(claimStageResult())
                    late.resolve(null)
                    return new PassThrough()
                },
            },
        ])

        const winner = await result
        await late.promise
        await flush()

        expect(seen.early).toEqual([true, true])
        expect(seen.late).toEqual([false])
        expect(winner).not.toBeNull()
    })

    it('tell a failing arm that the other one already won', async () => {
        const winnerClaimed = deferred()
        let lostAtFailure: boolean | undefined
        const result = raceStreams([
            {
                name: 'winner',
                run: async () => {
                    claimStageResult()
                    winnerClaimed.resolve(null)
                    return new PassThrough()
                },
            },
            {
                name: 'failing',
                run: async () => {
                    await winnerClaimed.promise
                    lostAtFailure = raceWonByAnotherArm()
                    return null
                },
            },
        ])

        await result
        await flush()

        expect(lostAtFailure).toBe(true)
    })
})

describe('claimed then empty', () => {
    it('frees the win so the other arm can still answer', async () => {
        const stream = new PassThrough()
        const result = await raceStreams([
            {
                name: 'claims-then-empty',
                run: async () => {
                    claimStageResult()
                    return null
                },
            },
            {
                name: 'answers',
                run: async () => {
                    await flush()
                    return stream
                },
            },
        ])

        expect(result).toBe(stream)
    })
})
