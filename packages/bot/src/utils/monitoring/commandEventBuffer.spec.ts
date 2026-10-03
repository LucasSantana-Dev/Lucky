import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const incMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
    getPrismaClient: jest.fn(),
}))

jest.mock('./prometheus', () => ({
    commandEventsDroppedTotal: {
        inc: (...args: unknown[]) => incMock(...args),
    },
}))

import {
    createCommandEventBuffer,
    type CommandEventRow,
} from './commandEventBuffer'

const row = (n = 0): CommandEventRow => ({
    occurredAt: new Date(0),
    guildId: 'g',
    userId: `u${n}`,
    command: 'play',
    subcommand: null,
    kind: 'slash',
    outcome: 'ok',
    latencyMs: 5,
    errorClass: null,
    shardId: 0,
})

describe('commandEventBuffer', () => {
    let flushFn: jest.Mock<(rows: CommandEventRow[]) => Promise<unknown>>

    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
        flushFn = jest.fn(async () => undefined)
    })
    afterEach(() => {
        jest.useRealTimers()
    })

    it('flushes when the buffer reaches flushSize rows', async () => {
        const buf = createCommandEventBuffer({ flush: flushFn, flushSize: 3 })
        buf.push(row(1))
        buf.push(row(2))
        expect(flushFn).not.toHaveBeenCalled()
        buf.push(row(3))
        await jest.advanceTimersByTimeAsync(0)
        expect(flushFn).toHaveBeenCalledTimes(1)
        expect(flushFn.mock.calls[0]?.[0]).toHaveLength(3)
        expect(buf.size()).toBe(0)
        await buf.stop()
    })

    it('flushes on the interval timer', async () => {
        const buf = createCommandEventBuffer({
            flush: flushFn,
            flushSize: 100,
            flushIntervalMs: 5000,
        })
        buf.push(row())
        await jest.advanceTimersByTimeAsync(4999)
        expect(flushFn).not.toHaveBeenCalled()
        await jest.advanceTimersByTimeAsync(1)
        expect(flushFn).toHaveBeenCalledTimes(1)
        await buf.stop()
    })

    it('drops on overflow, counting exactly and warning', async () => {
        const buf = createCommandEventBuffer({
            flush: flushFn,
            maxSize: 2,
            flushSize: 100,
        })
        for (let i = 0; i < 5; i++) buf.push(row(i))
        expect(buf.size()).toBe(2)
        const overflowIncs = incMock.mock.calls.filter(
            (c) => (c[0] as { reason: string }).reason === 'overflow',
        )
        expect(overflowIncs).toHaveLength(3)
        expect(warnLogMock).toHaveBeenCalledTimes(1)
        await buf.stop()
    })

    it('counts the batch size on flush failure, warns, does not throw or retry', async () => {
        flushFn.mockRejectedValueOnce(new Error('db down'))
        const buf = createCommandEventBuffer({ flush: flushFn, flushSize: 100 })
        buf.push(row(1))
        buf.push(row(2))
        await expect(buf.flush()).resolves.toBeUndefined()
        expect(incMock).toHaveBeenCalledWith({ reason: 'flush_failure' }, 2)
        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(buf.size()).toBe(0)
        await jest.advanceTimersByTimeAsync(60_000)
        expect(flushFn).toHaveBeenCalledTimes(1)
        await buf.stop()
    })

    it('rate-limits warnings within the window and warns again after it', async () => {
        const buf = createCommandEventBuffer({
            flush: flushFn,
            maxSize: 1,
            flushSize: 100,
            warnIntervalMs: 60_000,
        })
        for (let i = 0; i < 10; i++) buf.push(row(i))
        expect(warnLogMock).toHaveBeenCalledTimes(1)
        jest.setSystemTime(Date.now() + 61_000)
        buf.push(row(99))
        expect(warnLogMock).toHaveBeenCalledTimes(2)
        await buf.stop()
    })

    it('push never throws even if the flush function throws synchronously', async () => {
        flushFn.mockImplementation(() => {
            throw new Error('sync boom')
        })
        const buf = createCommandEventBuffer({ flush: flushFn, flushSize: 1 })
        expect(() => buf.push(row())).not.toThrow()
        await jest.advanceTimersByTimeAsync(0)
        expect(incMock).toHaveBeenCalledWith({ reason: 'flush_failure' }, 1)
        await buf.stop()
    })

    it('stop flushes the remainder and clears the timer', async () => {
        const buf = createCommandEventBuffer({ flush: flushFn, flushSize: 100 })
        buf.push(row(1))
        buf.push(row(2))
        await buf.stop()
        expect(flushFn).toHaveBeenCalledTimes(1)
        expect(flushFn.mock.calls[0]?.[0]).toHaveLength(2)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('does not flush an empty buffer', async () => {
        const buf = createCommandEventBuffer({ flush: flushFn })
        await buf.flush()
        expect(flushFn).not.toHaveBeenCalled()
        await buf.stop()
    })

    it('stays bounded when the DB never resolves (exact overflow counts)', async () => {
        flushFn.mockImplementation(() => new Promise(() => undefined))
        const buf = createCommandEventBuffer({
            flush: flushFn,
            maxSize: 200,
            flushSize: 50,
        })
        for (let i = 0; i < 10_000; i++) buf.push(row(i))
        await jest.advanceTimersByTimeAsync(60_000)
        for (let i = 0; i < 100; i++) buf.push(row(i))
        const overflow = incMock.mock.calls.filter(
            (c) => (c[0] as { reason: string }).reason === 'overflow',
        )
        // 200 accepted in total, everything else dropped and counted
        expect(overflow).toHaveLength(10_100 - 200)
        expect(buf.size()).toBeLessThanOrEqual(200)
        // chained flushes wait behind the hung one: only the first ran
        expect(flushFn).toHaveBeenCalledTimes(1)
    })

    it('counts pushes after stop as dropped (stopped) and does not re-arm the timer', async () => {
        const buf = createCommandEventBuffer({ flush: flushFn })
        await buf.stop()
        buf.push(row())
        expect(incMock).toHaveBeenCalledWith({ reason: 'stopped' })
        expect(buf.size()).toBe(0)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('stop gives up after the timeout when the flush hangs', async () => {
        flushFn.mockImplementation(() => new Promise(() => undefined))
        const buf = createCommandEventBuffer({
            flush: flushFn,
            stopTimeoutMs: 5000,
        })
        buf.push(row())
        let done = false
        const p = buf.stop().then(() => {
            done = true
        })
        await jest.advanceTimersByTimeAsync(4999)
        expect(done).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        await p
        expect(done).toBe(true)
        expect(jest.getTimerCount()).toBe(0)
    })

    it('labels unexpected internal throws internal_error, counting only if not enqueued', async () => {
        const buf = createCommandEventBuffer({ flush: flushFn, flushSize: 100 })
        warnLogMock.mockImplementationOnce(() => {
            throw new Error('logger down')
        })
        // overflow path: warn throws before enqueue is possible
        const small = createCommandEventBuffer({
            flush: flushFn,
            maxSize: 0,
        })
        expect(() => small.push(row())).not.toThrow()
        expect(incMock).toHaveBeenCalledWith({ reason: 'overflow' })
        expect(incMock).toHaveBeenCalledWith({ reason: 'internal_error' })
        await buf.stop()
        await small.stop()
    })
})
