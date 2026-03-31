import {
    describe,
    test,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import { getAutoplayStats, shouldEnableAutoplay } from './stats'

const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => {
    return {
        guildSettingsService: {
            getAutoplayCounter: jest.fn(),
        },
        trackHistoryService: {
            getTrackHistory: jest.fn(),
        },
    }
})

describe('autoplay/stats', () => {
    let mockGetAutoplayCounter: jest.Mock
    let mockGetTrackHistory: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        const {
            guildSettingsService,
            trackHistoryService,
        } = require('@lucky/shared/services')
        mockGetAutoplayCounter =
            guildSettingsService.getAutoplayCounter as jest.Mock
        mockGetTrackHistory = trackHistoryService.getTrackHistory as jest.Mock
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('getAutoplayStats', () => {
        test('returns stats with 0 total when counter not found', async () => {
            mockGetAutoplayCounter.mockResolvedValue(null)
            mockGetTrackHistory.mockResolvedValue([])

            const result = await getAutoplayStats('guild-1')

            expect(result.total).toBe(0)
            expect(result.thisWeek).toBe(0)
            expect(result.thisMonth).toBe(0)
            expect(result.averagePerDay).toBe(0)
        })

        test('returns total count from counter', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 150 })
            mockGetTrackHistory.mockResolvedValue([])

            const result = await getAutoplayStats('guild-1')

            expect(result.total).toBe(150)
        })

        test('calculates this week count correctly', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
            const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000

            const history = [
                { timestamp: now, trackId: '1' },
                { timestamp: oneWeekAgo + 1000, trackId: '2' },
                { timestamp: twoWeeksAgo, trackId: '3' },
            ]
            mockGetTrackHistory.mockResolvedValue(history)

            const result = await getAutoplayStats('guild-1')

            expect(result.thisWeek).toBe(2)
        })

        test('calculates this month count correctly', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000
            const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000

            const history = [
                { timestamp: now, trackId: '1' },
                { timestamp: oneMonthAgo + 1000, trackId: '2' },
                { timestamp: twoMonthsAgo, trackId: '3' },
            ]
            mockGetTrackHistory.mockResolvedValue(history)

            const result = await getAutoplayStats('guild-1')

            expect(result.thisMonth).toBe(2)
        })

        test('calculates average per day from week data', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

            const history = [
                { timestamp: now, trackId: '1' },
                { timestamp: now - 1000, trackId: '2' },
                { timestamp: now - 2000, trackId: '3' },
                { timestamp: oneWeekAgo + 1000, trackId: '4' },
                { timestamp: oneWeekAgo + 2000, trackId: '5' },
                { timestamp: oneWeekAgo + 3000, trackId: '6' },
                { timestamp: oneWeekAgo + 4000, trackId: '7' },
            ]
            mockGetTrackHistory.mockResolvedValue(history)

            const result = await getAutoplayStats('guild-1')

            expect(result.thisWeek).toBe(7)
            expect(result.averagePerDay).toBeCloseTo(1)
        })

        test('returns default stats on error', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Service error'))

            const result = await getAutoplayStats('guild-1')

            expect(result).toEqual({
                total: 0,
                thisWeek: 0,
                thisMonth: 0,
                averagePerDay: 0,
            })
        })

        test('logs error when exception occurs', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Service error'))

            await getAutoplayStats('guild-1')

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error getting autoplay stats:',
                }),
            )
        })

        test('handles empty history gracefully', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 100 })
            mockGetTrackHistory.mockResolvedValue([])

            const result = await getAutoplayStats('guild-1')

            expect(result.thisWeek).toBe(0)
            expect(result.thisMonth).toBe(0)
            expect(result.averagePerDay).toBe(0)
        })

        test('fetches 100 history entries', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            mockGetTrackHistory.mockResolvedValue([])

            await getAutoplayStats('guild-1')

            expect(mockGetTrackHistory).toHaveBeenCalledWith('guild-1', 100)
        })

        test('correctly handles timestamp greater than comparison', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const DAY = 24 * 60 * 60 * 1000

            const history = [
                { timestamp: now - 8 * DAY, trackId: '1' },
                { timestamp: now - 6 * DAY, trackId: '2' },
                { timestamp: now - 31 * DAY, trackId: '3' },
                { timestamp: now - 29 * DAY, trackId: '4' },
            ]
            mockGetTrackHistory.mockResolvedValue(history)

            const result = await getAutoplayStats('guild-1')

            expect(result.thisWeek).toBeGreaterThanOrEqual(1)
            expect(result.thisMonth).toBeGreaterThanOrEqual(2)
        })
    })

    describe('shouldEnableAutoplay', () => {
        test('returns true when there is activity this week', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const oneDayAgo = now - 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: oneDayAgo, trackId: '1' },
            ])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(true)
        })

        test('returns true when total count is greater than 5', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 10 })
            mockGetTrackHistory.mockResolvedValue([])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(true)
        })

        test('returns false when no activity this week and total is <= 5', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 3 })
            const now = Date.now()
            const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: twoWeeksAgo, trackId: '1' },
            ])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(false)
        })

        test('returns false when no history and count is 0', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            mockGetTrackHistory.mockResolvedValue([])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(false)
        })

        test('returns false when no history and count is 5', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 5 })
            mockGetTrackHistory.mockResolvedValue([])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(false)
        })

        test('returns true when count is 6', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 6 })
            mockGetTrackHistory.mockResolvedValue([])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(true)
        })

        test('returns false on error', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Service error'))

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(false)
        })

        test('logs error when exception occurs', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Service error'))

            await shouldEnableAutoplay('guild-1')

            expect(errorLogMock).toHaveBeenCalled()
        })

        test('enables autoplay with activity this week only', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 1 })
            const now = Date.now()
            const oneDayAgo = now - 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: oneDayAgo, trackId: '1' },
            ])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(true)
        })

        test('considers count with 6 as enabling factor', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 100 })
            const now = Date.now()
            const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: threeMonthsAgo, trackId: '1' },
            ])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(true)
        })

        test('returns true when both conditions met', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 100 })
            const now = Date.now()
            const oneDayAgo = now - 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: oneDayAgo, trackId: '1' },
            ])

            const result = await shouldEnableAutoplay('guild-1')

            expect(result).toBe(true)
        })
    })
})
