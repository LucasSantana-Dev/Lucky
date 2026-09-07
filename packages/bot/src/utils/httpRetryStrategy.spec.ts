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

    it('throws when status matches an extraStatus', () => {
        const res = new Response(null, { status: 503 })
        let thrown: unknown
        try {
            throwIfRetryable(res, [503])
        } catch (err) {
            thrown = err
        }
        expect(thrown).toBe(res)
    })

    it('does not throw when status does not match any extraStatus', () => {
        const res = new Response(null, { status: 503 })
        expect(() => throwIfRetryable(res, [500, 502])).not.toThrow()
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

    it('retries a 5xx Response when retryableStatuses includes it', async () => {
        const serverError = new Response(null, {
            status: 503,
            headers: { 'Retry-After': '0' },
        })
        const fn = jest
            .fn()
            .mockRejectedValueOnce(serverError)
            .mockResolvedValueOnce('ok')

        const result = await withRetry('test', fn, 2, {
            retryableStatuses: [503],
        })

        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('still retries 429 even when custom retryableStatuses provided', async () => {
        const rateLimited = new Response(null, {
            status: 429,
            headers: { 'Retry-After': '0' },
        })
        const fn = jest
            .fn()
            .mockRejectedValueOnce(rateLimited)
            .mockResolvedValueOnce('ok')

        const result = await withRetry('test', fn, 2, {
            retryableStatuses: [503],
        })

        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('retries a network error when retryNetworkErrors is true', async () => {
        const networkError = new Error('Network timeout')
        const fn = jest
            .fn()
            .mockRejectedValueOnce(networkError)
            .mockResolvedValueOnce('ok')

        const result = await withRetry('test', fn, 2, {
            retryNetworkErrors: true,
        })

        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('does not retry a network error when retryNetworkErrors is false', async () => {
        const networkError = new Error('Network timeout')
        const fn = jest.fn().mockRejectedValue(networkError)

        await expect(
            withRetry('test', fn, 2, { retryNetworkErrors: false }),
        ).rejects.toBe(networkError)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('does not retry a non-network error even when retryNetworkErrors is true', async () => {
        const logicError = new Error('Invalid input: malformed JSON')
        const fn = jest.fn().mockRejectedValue(logicError)

        await expect(
            withRetry('test', fn, 2, { retryNetworkErrors: true }),
        ).rejects.toBe(logicError)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries an ECONNREFUSED error when retryNetworkErrors is true', async () => {
        const connRefused = new Error('ECONNREFUSED: connection refused')
        const fn = jest
            .fn()
            .mockRejectedValueOnce(connRefused)
            .mockResolvedValueOnce('ok')

        const result = await withRetry('test', fn, 2, {
            retryNetworkErrors: true,
        })

        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('retries a wrapped network error (Node fetch pattern) when retryNetworkErrors is true', async () => {
        // Node's fetch (undici) wraps connection errors as TypeError with cause
        const wrappedError = new TypeError('fetch failed')
        const cause = new Error('connect ECONNREFUSED 127.0.0.1:59999')
        Object.defineProperty(wrappedError, 'cause', { value: cause })

        const fn = jest
            .fn()
            .mockRejectedValueOnce(wrappedError)
            .mockResolvedValueOnce('ok')

        const result = await withRetry('test', fn, 2, {
            retryNetworkErrors: true,
        })

        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('honors Retry-After on any retryable Response, not just 429', async () => {
        const serverErrorWithRetryAfter = new Response(null, {
            status: 503,
            headers: { 'Retry-After': '0' },
        })
        const fn = jest
            .fn()
            .mockRejectedValueOnce(serverErrorWithRetryAfter)
            .mockResolvedValueOnce('ok')

        const result = await withRetry('test', fn, 2, {
            retryableStatuses: [503],
        })

        expect(result).toBe('ok')
        expect(fn).toHaveBeenCalledTimes(2)
    })
})
