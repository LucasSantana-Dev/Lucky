import {
    describe,
    test,
    expect,
    beforeEach,
    jest,
} from '@jest/globals'
import { getAutoplayStats, shouldEnableAutoplay } from './stats'

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
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
        const { guildSettingsService, trackHistoryService } = require('@lucky/shared/services')
        mockGetAutoplayCounter = guildSettingsService.getAutoplayCounter as jest.Mock
        mockGetTrackHistory = trackHistoryService.getTrackHistory as jest.Mock
    })

    describe('getAutoplayStats', () => {
        test('returns zeroed stats when counter is null and history is empty', async () => {
            mockGetAutoplayCounter.mockResolvedValue(null)
            mockGetTrackHistory.mockResolvedValue([])

            const result = await getAutoplayStats('guild-1')

            expect(result).toEqual({ total: 0, thisWeek: 0, thisMonth: 0, averagePerDay: 0 })
        })

        test('calculates this week count correctly', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: now, trackId: '1' },
                { timestamp: oneWeekAgo + 1000, trackId: '2' },
                { timestamp: oneWeekAgo - 1000, trackId: '3' },
            ])

            expect((await getAutoplayStats('guild-1')).thisWeek).toBe(2)
        })

        test('calculates this month count correctly', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: now, trackId: '1' },
                { timestamp: oneMonthAgo + 1000, trackId: '2' },
                { timestamp: oneMonthAgo - 1000, trackId: '3' },
            ])

            expect((await getAutoplayStats('guild-1')).thisMonth).toBe(2)
        })

        test('calculates average per day from week data', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

            const history = Array.from({ length: 7 }, (_, i) => ({
                timestamp: oneWeekAgo + (i + 1) * 1000,
                trackId: String(i),
            }))
            mockGetTrackHistory.mockResolvedValue(history)

            const result = await getAutoplayStats('guild-1')
            expect(result.thisWeek).toBe(7)
            expect(result.averagePerDay).toBeCloseTo(1)
        })

        test('returns default stats on service error', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Service error'))

            expect(await getAutoplayStats('guild-1')).toEqual({
                total: 0, thisWeek: 0, thisMonth: 0, averagePerDay: 0,
            })
        })

        test('handles boundary timestamps around the week cutoff', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            const now = Date.now()
            const DAY = 24 * 60 * 60 * 1000

            mockGetTrackHistory.mockResolvedValue([
                { timestamp: now - 6 * DAY, trackId: '1' },
                { timestamp: now - 8 * DAY, trackId: '2' },
                { timestamp: now - 29 * DAY, trackId: '3' },
                { timestamp: now - 31 * DAY, trackId: '4' },
            ])

            const result = await getAutoplayStats('guild-1')
            expect(result.thisWeek).toBe(1)
            expect(result.thisMonth).toBe(3)
        })
    })

    describe('shouldEnableAutoplay', () => {
        test('returns true when there is activity this week', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 0 })
            mockGetTrackHistory.mockResolvedValue([
                { timestamp: Date.now() - 24 * 60 * 60 * 1000, trackId: '1' },
            ])
            expect(await shouldEnableAutoplay('guild-1')).toBe(true)
        })

        test('returns true when total count exceeds 5 with no recent activity', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 10 })
            mockGetTrackHistory.mockResolvedValue([])
            expect(await shouldEnableAutoplay('guild-1')).toBe(true)
        })

        test('returns false when no activity this week and total is 3', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 3 })
            mockGetTrackHistory.mockResolvedValue([
                { timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000, trackId: '1' },
            ])
            expect(await shouldEnableAutoplay('guild-1')).toBe(false)
        })

        test('boundary: count=5 returns false, count=6 returns true', async () => {
            mockGetTrackHistory.mockResolvedValue([])

            mockGetAutoplayCounter.mockResolvedValue({ count: 5 })
            expect(await shouldEnableAutoplay('guild-1')).toBe(false)

            mockGetAutoplayCounter.mockResolvedValue({ count: 6 })
            expect(await shouldEnableAutoplay('guild-1')).toBe(true)
        })

        test('returns false on service error', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Service error'))
            expect(await shouldEnableAutoplay('guild-1')).toBe(false)
        })
    })
})
