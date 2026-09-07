import { describe, expect, it, jest } from '@jest/globals'
import {
    parseRetryAfterMs,
    throwIfRetryable,
    withRetry,
} from './httpRetryStrategy'

describe('parseRetryAfterMs', () => {
    it('returns null for a missing header', () => {
        expect(parseRetryAfterMs(null)).toBeNull()
    })

    it('returns null for a blank header', () => {
        expect(parseRetryAfterMs('   ')).toBeNull()
    })

    it('parses delta-seconds form into milliseconds', () => {
        expect(parseRetryAfterMs('5')).toBe(5000)
    })

    it('parses an HTTP-date form into a positive delay', () => {
        const future = new Date(Date.now() + 10_000).toUTCString()
        const delay = parseRetryAfterMs(future)
        expect(delay).not.toBeNull()
        expect(delay).toBeGreaterThan(0)
        expect(delay).toBeLessThanOrEqual(10_000)
    })

    it('returns 0 for a past HTTP-date', () => {
        const past = new Date(Date.now() - 10_000).toUTCString()
        expect(parseRetryAfterMs(past)).toBe(0)
    })

    it('returns null for an unparseable header', () => {
        expect(parseRetryAfterMs('not-a-date-or-number')).toBeNull()
    })
})

describe('throwIfRetryable', () => {
    it('throws the response when status is 429', () => {
        const res = new Response(null, { status: 429 })
        let thrown: unknown
        try {
            throwIfRetryable(res)
        } catch (err) {
            thrown = err
        }
        expect(thrown).toBe(res)
    })

    it('does not throw for a non-429 status', () => {
        const res = new Response(null, { status: 500 })
        expect(() => throwIfRetryable(res)).not.toThrow()
    })
})

describe('withRetry', () => {
    it('returns the result on first success without retrying', async () => {
        const fn = jest.fn().mockResolvedValue('ok')
        const result = await withRetry('test', fn)
        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries after a 429 Response and succeeds', async () => {
        const fn = jest
            .fn()
            .mockRejectedValueOnce(
                new Response(null, {
                    status: 429,
                    headers: { 'Retry-After': '0' },
                }),
            )
            .mockResolvedValueOnce('ok')

        const result = await withRetry('test', fn)

        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('gives up after maxRetries and rethrows', async () => {
        const rateLimited = new Response(null, {
            status: 429,
            headers: { 'Retry-After': '0' },
        })
        const fn = jest.fn().mockRejectedValue(rateLimited)

        await expect(withRetry('test', fn, 2)).rejects.toBe(rateLimited)
        expect(fn).toHaveBeenCalledTimes(3)
    })

    it('rethrows immediately for a non-429 error without retrying', async () => {
        const err = new Error('boom')
        const fn = jest.fn().mockRejectedValue(err)

        await expect(withRetry('test', fn)).rejects.toBe(err)
        expect(fn).toHaveBeenCalledTimes(1)
    })
})
