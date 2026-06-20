import { describe, it, expect, beforeEach } from '@jest/globals'
import { recordWithCooldown, __resetAlertWindowForTests } from './alertWindow'

beforeEach(() => {
    __resetAlertWindowForTests()
})

describe('recordWithCooldown', () => {
    it('returns false while below threshold', () => {
        expect(recordWithCooldown('k', 1000, 3, 5000)).toBe(false)
        expect(recordWithCooldown('k', 1000, 3, 5000)).toBe(false)
    })

    it('returns true on the threshold hit', () => {
        recordWithCooldown('k', 1000, 3, 5000)
        recordWithCooldown('k', 1000, 3, 5000)
        expect(recordWithCooldown('k', 1000, 3, 5000)).toBe(true)
    })

    it('returns false during cooldown after trigger', () => {
        recordWithCooldown('k', 1000, 1, 60_000)
        // Just triggered — cooldown is active
        expect(recordWithCooldown('k', 1000, 1, 60_000)).toBe(false)
    })

    it('isolates different keys', () => {
        recordWithCooldown('a', 1000, 2, 5000)
        expect(recordWithCooldown('a', 1000, 2, 5000)).toBe(true)
        // 'b' window is clean
        expect(recordWithCooldown('b', 1000, 2, 5000)).toBe(false)
    })
})
