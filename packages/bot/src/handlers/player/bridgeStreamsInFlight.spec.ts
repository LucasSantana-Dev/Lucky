import {
    isBridgeStreamInFlight,
    runBridgeStreamOnce,
} from './bridgeStreamsInFlight'

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

describe('bridgeStreamsInFlight (#3064)', () => {
    it('marks a track in flight only while its stream resolves', async () => {
        const track = { title: 'Human Nature' }
        const gate = deferred<string>()

        const run = runBridgeStreamOnce(track, () => gate.promise, jest.fn())
        expect(isBridgeStreamInFlight(track)).toBe(true)
        expect(isBridgeStreamInFlight({ title: 'Human Nature' })).toBe(false)

        gate.resolve('stream')
        await expect(run).resolves.toBe('stream')
        expect(isBridgeStreamInFlight(track)).toBe(false)
    })

    it('a second stream of the same track waits for the first before starting', async () => {
        const track = { title: 'Human Nature' }
        const first = deferred<string>()
        const startFirst = jest.fn(() => first.promise)
        const startSecond = jest.fn(async () => 'second-stream')
        const onJoin = jest.fn()

        const firstRun = runBridgeStreamOnce(track, startFirst, onJoin)
        const secondRun = runBridgeStreamOnce(track, startSecond, onJoin)
        await Promise.resolve()

        expect(onJoin).toHaveBeenCalledTimes(1)
        expect(startSecond).not.toHaveBeenCalled()

        first.resolve('first-stream')
        await expect(firstRun).resolves.toBe('first-stream')
        await expect(secondRun).resolves.toBe('second-stream')
        expect(startFirst).toHaveBeenCalledTimes(1)
        expect(startSecond).toHaveBeenCalledTimes(1)
        expect(isBridgeStreamInFlight(track)).toBe(false)
    })

    it('a failed first stream still lets the waiting one run, and clears the mark', async () => {
        const track = { title: 'Song' }
        const first = deferred<string>()
        const onJoin = jest.fn()

        const firstRun = runBridgeStreamOnce(track, () => first.promise, onJoin)
        const secondRun = runBridgeStreamOnce(track, async () => 'ok', onJoin)

        first.reject(new Error('exhausted'))
        await expect(firstRun).rejects.toThrow('exhausted')
        await expect(secondRun).resolves.toBe('ok')
        expect(isBridgeStreamInFlight(track)).toBe(false)
    })

    it('different tracks do not wait for each other', async () => {
        const gate = deferred<string>()
        const onJoin = jest.fn()

        void runBridgeStreamOnce({ title: 'A' }, () => gate.promise, onJoin)
        const other = runBridgeStreamOnce(
            { title: 'B' },
            async () => 'b',
            onJoin,
        )

        await expect(other).resolves.toBe('b')
        expect(onJoin).not.toHaveBeenCalled()
        gate.resolve('a')
    })

    it('treats a missing track as not in flight', () => {
        expect(isBridgeStreamInFlight(null)).toBe(false)
        expect(isBridgeStreamInFlight(undefined)).toBe(false)
    })
})
