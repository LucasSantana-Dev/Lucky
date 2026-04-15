import { setReplenishSuppressed, isReplenishSuppressed } from './replenishSuppressionStore'

describe('replenishSuppressionStore', () => {
    const guildId = 'test-guild-123'

    beforeEach(() => {
        setReplenishSuppressed(guildId, 0)
    })

    describe('setReplenishSuppressed', () => {
        it('should set suppression with a duration in milliseconds', () => {
            setReplenishSuppressed(guildId, 5000)
            expect(isReplenishSuppressed(guildId)).toBe(true)
        })

        it('should clear suppression when ms is 0', () => {
            setReplenishSuppressed(guildId, 5000)
            setReplenishSuppressed(guildId, 0)
            expect(isReplenishSuppressed(guildId)).toBe(false)
        })

        it('should clear suppression when ms is negative', () => {
            setReplenishSuppressed(guildId, 5000)
            setReplenishSuppressed(guildId, -1)
            expect(isReplenishSuppressed(guildId)).toBe(false)
        })
    })

    describe('isReplenishSuppressed', () => {
        it('should return false for unset guild', () => {
            expect(isReplenishSuppressed('unknown-guild')).toBe(false)
        })

        it('should return true within suppression window', () => {
            setReplenishSuppressed(guildId, 1000)
            expect(isReplenishSuppressed(guildId)).toBe(true)
        })

        it('should return false after suppression expires', async () => {
            setReplenishSuppressed(guildId, 100)
            expect(isReplenishSuppressed(guildId)).toBe(true)

            await new Promise((resolve) => setTimeout(resolve, 150))
            expect(isReplenishSuppressed(guildId)).toBe(false)
        })

        it('should clean up expired entries', async () => {
            setReplenishSuppressed(guildId, 100)
            await new Promise((resolve) => setTimeout(resolve, 150))
            isReplenishSuppressed(guildId)

            setReplenishSuppressed(guildId, 100)
            expect(isReplenishSuppressed(guildId)).toBe(true)
        })

        it('should handle default 30s suppression', () => {
            setReplenishSuppressed(guildId, 30_000)
            expect(isReplenishSuppressed(guildId)).toBe(true)
        })
    })
})
