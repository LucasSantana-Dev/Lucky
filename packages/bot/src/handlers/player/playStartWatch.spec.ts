import { afterEach, describe, expect, it, jest } from '@jest/globals'
import {
    closePlayStartWatch,
    openPlayStartWatch,
    settlePlayStartWatch,
    waitForPlayStartOutcome,
} from './playStartWatch'

const track = (id: string) => ({ id }) as never

describe('playStartWatch', () => {
    afterEach(() => {
        jest.useRealTimers()
    })

    it('settles the watch for the same guild and track', async () => {
        const watch = openPlayStartWatch('g1', track('t1'))

        expect(settlePlayStartWatch('g1', track('t1'), 'recovered')).toBe(true)
        await expect(watch.settled).resolves.toBe('recovered')
        closePlayStartWatch(watch)
    })

    it('does not match another guild, another track or no track', () => {
        const watch = openPlayStartWatch('g1', track('t1'))

        expect(settlePlayStartWatch('g2', track('t1'), 'gave_up')).toBe(false)
        expect(settlePlayStartWatch('g1', track('t2'), 'gave_up')).toBe(false)
        expect(settlePlayStartWatch('g1', null, 'gave_up')).toBe(false)
        closePlayStartWatch(watch)
    })

    it('follows a track update from a later search arm', () => {
        const watch = openPlayStartWatch('g1', track('t1'))
        watch.track = track('t2')

        expect(settlePlayStartWatch('g1', track('t2'), 'gave_up')).toBe(true)
        closePlayStartWatch(watch)
    })

    it('is gone after close, and closing an old watch keeps a newer one', () => {
        const first = openPlayStartWatch('g1', track('t1'))
        const second = openPlayStartWatch('g1', track('t1'))

        closePlayStartWatch(first)
        expect(settlePlayStartWatch('g1', track('t1'), 'gave_up')).toBe(true)

        closePlayStartWatch(second)
        expect(settlePlayStartWatch('g1', track('t1'), 'gave_up')).toBe(false)
    })

    it('times out when recovery never reports', async () => {
        jest.useFakeTimers()
        const watch = openPlayStartWatch('g1', track('t1'))

        const pending = waitForPlayStartOutcome(watch, 15_000)
        jest.advanceTimersByTime(15_000)

        await expect(pending).resolves.toBe('timeout')
        closePlayStartWatch(watch)
    })
})
