import { describe, expect, it } from '@jest/globals'

import { TimeoutError, withTimeout } from './async'

describe('withTimeout', () => {
    it('resolves with the value when the promise settles before the deadline', async () => {
        await expect(
            withTimeout(Promise.resolve('ok'), 1000, 'fast'),
        ).resolves.toBe('ok')
    })

    it('rejects with a TimeoutError when the deadline fires first', async () => {
        const slow = new Promise<string>((resolve) => {
            setTimeout(() => resolve('late'), 200)
        })

        await expect(withTimeout(slow, 10, 'slow-op')).rejects.toBeInstanceOf(
            TimeoutError,
        )
    })

    it('carries the label and timeoutMs on the TimeoutError', async () => {
        const never = new Promise<void>(() => {})

        const error = await withTimeout(never, 15, 'tier-2').catch(
            (e: unknown) => e,
        )

        expect(error).toBeInstanceOf(TimeoutError)
        expect((error as TimeoutError).label).toBe('tier-2')
        expect((error as TimeoutError).timeoutMs).toBe(15)
        expect((error as TimeoutError).message).toContain('tier-2')
        expect((error as TimeoutError).message).toContain('15ms')
    })

    it('propagates the original rejection rather than masking it as a timeout', async () => {
        const boom = Promise.reject(new Error('boom'))

        await expect(withTimeout(boom, 1000, 'fails-fast')).rejects.toThrow(
            'boom',
        )
    })
})
