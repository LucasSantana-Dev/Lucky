import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { TtlCache } from './cache'

describe('TtlCache', () => {
    afterEach(() => {
        jest.useRealTimers()
    })

    it('returns a stored value before expiry and undefined for a miss', () => {
        const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 })
        cache.set('a', 1)

        expect(cache.get('a')).toBe(1)
        expect(cache.get('missing')).toBeUndefined()
    })

    it('expires entries after the TTL elapses', () => {
        jest.useFakeTimers()
        const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 10 })
        cache.set('k', 'v')

        jest.advanceTimersByTime(999)
        expect(cache.get('k')).toBe('v')

        jest.advanceTimersByTime(2)
        expect(cache.get('k')).toBeUndefined()
    })

    it('evicts the oldest-written key when over capacity', () => {
        const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2 })
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('c', 3) // exceeds maxEntries → evict 'a'

        expect(cache.get('a')).toBeUndefined()
        expect(cache.get('b')).toBe(2)
        expect(cache.get('c')).toBe(3)
        expect(cache.size).toBe(2)
    })

    it('refreshes recency on re-write so a rewritten key is not evicted next', () => {
        const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2 })
        cache.set('a', 1)
        cache.set('b', 2)
        cache.set('a', 11) // 'a' moves to newest
        cache.set('c', 3) // evicts oldest = 'b'

        expect(cache.get('a')).toBe(11)
        expect(cache.get('b')).toBeUndefined()
        expect(cache.get('c')).toBe(3)
    })

    it('supports delete and clear', () => {
        const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 10 })
        cache.set('a', 1)
        cache.set('b', 2)

        cache.delete('a')
        expect(cache.get('a')).toBeUndefined()
        expect(cache.size).toBe(1)

        cache.clear()
        expect(cache.get('b')).toBeUndefined()
        expect(cache.size).toBe(0)
    })
})
