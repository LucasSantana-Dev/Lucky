import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const warnLogMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('../general/log', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

import { logAndRethrow, logAndSwallow, logAndWarn } from './logAndRethrow'

beforeEach(() => {
    jest.clearAllMocks()
})

describe('logAndRethrow', () => {
    it('logs at error level and rethrows an Error instance', () => {
        const err = new Error('original')
        expect(() => logAndRethrow(err, 'ctx')).toThrow('original')
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'ctx: original', error: err }),
        )
    })

    it('wraps non-Error values and rethrows', () => {
        expect(() => logAndRethrow('string error', 'ctx')).toThrow('string error')
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('passes data to errorLog', () => {
        expect(() => logAndRethrow(new Error('e'), 'ctx', { key: 'val' })).toThrow()
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ data: { key: 'val' } }),
        )
    })
})

describe('logAndSwallow', () => {
    it('logs at debug level and does not throw', () => {
        expect(() => logAndSwallow(new Error('swallowed'), 'ctx')).not.toThrow()
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'ctx: swallowed' }),
        )
    })

    it('wraps non-Error values', () => {
        logAndSwallow(42, 'ctx')
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'ctx: 42' }),
        )
    })

    it('passes data to debugLog', () => {
        logAndSwallow(new Error('e'), 'ctx', { key: 'val' })
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ key: 'val' }) }),
        )
    })
})

describe('logAndWarn', () => {
    it('logs at warn level and does not throw', () => {
        expect(() => logAndWarn(new Error('degraded'), 'ctx')).not.toThrow()
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'ctx: degraded' }),
        )
    })

    it('wraps non-Error values', () => {
        logAndWarn('plain string', 'ctx')
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'ctx: plain string' }),
        )
    })

    it('passes data to warnLog', () => {
        logAndWarn(new Error('e'), 'ctx', { extra: 'info' })
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ extra: 'info' }) }),
        )
    })

    it('includes stack in data', () => {
        const err = new Error('with stack')
        logAndWarn(err, 'ctx')
        const call = warnLogMock.mock.calls[0][0] as { data: { stack?: string } }
        expect(typeof call.data.stack).toBe('string')
    })
})
