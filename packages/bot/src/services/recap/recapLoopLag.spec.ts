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

        const lag = await stop()

        expect(lag.maxMs).toBeGreaterThanOrEqual(150)
        expect(lag.p99Ms).toBeGreaterThanOrEqual(150)
        expect(lag.meanMs).toBeLessThanOrEqual(lag.maxMs)
    })

    it('records a block that ends right before the stop', async () => {
        const stop = startLoopLagProbe(10)
        await wait(15)
        blockFor(200)

        const lag = await stop()

        expect(lag.maxMs).toBeGreaterThanOrEqual(150)
    })

    it('reads zero when the window is shorter than one sample', async () => {
        const stop = startLoopLagProbe(1000)

        expect(await stop()).toEqual({ maxMs: 0, p99Ms: 0, meanMs: 0 })
    })
})
