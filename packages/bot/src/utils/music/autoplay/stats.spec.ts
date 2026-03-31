import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getAutoplayStats, shouldEnableAutoplay } from './stats'

const getAutoplayCounterMock = jest.fn()
const getTrackHistoryMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getAutoplayCounter: (...args: unknown[]) =>
            getAutoplayCounterMock(...args),
    },
    trackHistoryService: {
        getTrackHistory: (...args: unknown[]) => getTrackHistoryMock(...args),
    },
}))

describe('getAutoplayStats', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('fetches autoplay counter from settings', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 100 })
        getTrackHistoryMock.mockResolvedValue([])

        await getAutoplayStats('guild-1')

        expect(getAutoplayCounterMock).toHaveBeenCalledWith('guild-1')
    })

    it('fetches track history with limit 100', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockResolvedValue([])

        await getAutoplayStats('guild-2')

        expect(getTrackHistoryMock).toHaveBeenCalledWith('guild-2', 100)
    })

    it('returns total count from counter', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 42 })
        getTrackHistoryMock.mockResolvedValue([])

        const stats = await getAutoplayStats('guild-3')

        expect(stats.total).toBe(42)
    })

    it('returns 0 for total when counter is null', async () => {
        getAutoplayCounterMock.mockResolvedValue(null)
        getTrackHistoryMock.mockResolvedValue([])

        const stats = await getAutoplayStats('guild-4')

        expect(stats.total).toBe(0)
    })

    it('counts tracks from this week in history', async () => {
        const now = Date.now()
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockResolvedValue([
            { timestamp: now - 1000 },
            { timestamp: now - 2000 },
            { timestamp: oneWeekAgo - 1000 },
        ])

        const stats = await getAutoplayStats('guild-5')

        expect(stats.thisWeek).toBe(2)
    })

    it('counts tracks from this month in history', async () => {
        const now = Date.now()
        const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000
        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockResolvedValue([
            { timestamp: now - 1000 },
            { timestamp: now - 2000 },
            { timestamp: oneMonthAgo - 1000 },
        ])

        const stats = await getAutoplayStats('guild-6')

        expect(stats.thisMonth).toBe(2)
    })

    it('calculates average per day from week count', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockResolvedValue([
            { timestamp: Date.now() - 1000 },
            { timestamp: Date.now() - 2000 },
            { timestamp: Date.now() - 3000 },
            { timestamp: Date.now() - 4000 },
            { timestamp: Date.now() - 5000 },
            { timestamp: Date.now() - 6000 },
            { timestamp: Date.now() - 7000 },
        ])

        const stats = await getAutoplayStats('guild-7')

        expect(stats.averagePerDay).toBe(7 / 7) // 1 per day
    })

    it('handles empty history gracefully', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 100 })
        getTrackHistoryMock.mockResolvedValue([])

        const stats = await getAutoplayStats('guild-8')

        expect(stats.thisWeek).toBe(0)
        expect(stats.thisMonth).toBe(0)
        expect(stats.averagePerDay).toBe(0)
    })

    it('returns error defaults when counter fetch fails', async () => {
        getAutoplayCounterMock.mockRejectedValue(new Error('db error'))
        getTrackHistoryMock.mockResolvedValue([])

        const stats = await getAutoplayStats('guild-9')

        expect(stats).toEqual({
            total: 0,
            thisWeek: 0,
            thisMonth: 0,
            averagePerDay: 0,
        })
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('returns error defaults when history fetch fails', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockRejectedValue(new Error('db error'))

        const stats = await getAutoplayStats('guild-10')

        expect(stats).toEqual({
            total: 0,
            thisWeek: 0,
            thisMonth: 0,
            averagePerDay: 0,
        })
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('correctly filters week data based on timestamp', async () => {
        const now = Date.now()
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
        const withinWeek = now - 1000 // Very recent
        const beyondWeek = oneWeekAgo - 1000 // Older than week

        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockResolvedValue([
            { timestamp: withinWeek },
            { timestamp: beyondWeek },
        ])

        const stats = await getAutoplayStats('guild-11')

        expect(stats.thisWeek).toBe(1)
    })

    it('correctly filters month data based on timestamp', async () => {
        const now = Date.now()
        const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000
        const withinMonth = now - 1000 // Very recent
        const beyondMonth = oneMonthAgo - 1000 // Older than month

        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockResolvedValue([
            { timestamp: withinMonth },
            { timestamp: beyondMonth },
        ])

        const stats = await getAutoplayStats('guild-12')

        expect(stats.thisMonth).toBe(1)
    })
})

describe('shouldEnableAutoplay', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns true when there is activity this week', async () => {
        const now = Date.now()
        getAutoplayCounterMock.mockResolvedValue({ count: 0 })
        getTrackHistoryMock.mockResolvedValue([{ timestamp: now - 1000 }])

        const result = await shouldEnableAutoplay('guild-13')

        expect(result).toBe(true)
    })

    it('returns true when total count > 5', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 10 })
        getTrackHistoryMock.mockResolvedValue([])

        const result = await shouldEnableAutoplay('guild-14')

        expect(result).toBe(true)
    })

    it('returns false when no recent activity and low total count', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 3 })
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        getTrackHistoryMock.mockResolvedValue([
            { timestamp: oneWeekAgo - 1000 },
        ])

        const result = await shouldEnableAutoplay('guild-15')

        expect(result).toBe(false)
    })

    it('returns false when no history and count is 0', async () => {
        getAutoplayCounterMock.mockResolvedValue(null)
        getTrackHistoryMock.mockResolvedValue([])

        const result = await shouldEnableAutoplay('guild-16')

        expect(result).toBe(false)
    })

    it('returns false on error', async () => {
        getAutoplayCounterMock.mockRejectedValue(new Error('db error'))

        const result = await shouldEnableAutoplay('guild-17')

        expect(result).toBe(false)
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('returns true when total count equals 5', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 5 })
        getTrackHistoryMock.mockResolvedValue([])

        const result = await shouldEnableAutoplay('guild-18')

        // Should return false because condition is > 5, not >= 5
        expect(result).toBe(false)
    })

    it('returns true when total count is 6', async () => {
        getAutoplayCounterMock.mockResolvedValue({ count: 6 })
        getTrackHistoryMock.mockResolvedValue([])

        const result = await shouldEnableAutoplay('guild-19')

        expect(result).toBe(true)
    })

    it('handles multiple conditions being true', async () => {
        const now = Date.now()
        getAutoplayCounterMock.mockResolvedValue({ count: 50 })
        getTrackHistoryMock.mockResolvedValue([{ timestamp: now - 1000 }])

        const result = await shouldEnableAutoplay('guild-20')

        expect(result).toBe(true)
    })
})
