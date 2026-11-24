import { startLoopLagProbe } from './recapLoopLag'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function blockFor(ms: number) {
    const until = Date.now() + ms
    while (Date.now() < until) {
        // Busy wait: holds the event loop like a synchronous hot path would.
    }
}

describe('startLoopLagProbe', () => {
    it('reports a blocked loop as lag', async () => {
        const stop = startLoopLagProbe(10)
        await wait(30)
        blockFor(200)
        await wait(30)

        const lag = stop()

        expect(lag.maxMs).toBeGreaterThanOrEqual(150)
        expect(lag.p99Ms).toBeGreaterThanOrEqual(150)
        expect(lag.meanMs).toBeLessThanOrEqual(lag.maxMs)
    })

    it('reads zero when the window is shorter than one sample', () => {
        const stop = startLoopLagProbe(1000)

        expect(stop()).toEqual({ maxMs: 0, p99Ms: 0, meanMs: 0 })
    })
})
