import {
    describe,
    test,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import {
    autoplayCounters,
    getAutoplayCount,
    incrementAutoplayCount,
    resetAutoplayCount,
    clearAllAutoplayCounters,
} from './counters'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => {
    return {
        guildSettingsService: {
            getAutoplayCounter: jest.fn(),
            incrementAutoplayCounter: jest.fn(),
            resetAutoplayCounter: jest.fn(),
            clearAllAutoplayCounters: jest.fn(),
        },
    }
})

describe('autoplay/counters', () => {
    let mockGetAutoplayCounter: jest.Mock
    let mockIncrementAutoplayCounter: jest.Mock
    let mockResetAutoplayCounter: jest.Mock
    let mockClearAllAutoplayCounters: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        autoplayCounters.clear()
        const { guildSettingsService } = require('@lucky/shared/services')
        mockGetAutoplayCounter =
            guildSettingsService.getAutoplayCounter as jest.Mock
        mockIncrementAutoplayCounter =
            guildSettingsService.incrementAutoplayCounter as jest.Mock
        mockResetAutoplayCounter =
            guildSettingsService.resetAutoplayCounter as jest.Mock
        mockClearAllAutoplayCounters =
            guildSettingsService.clearAllAutoplayCounters as jest.Mock
    })

    afterEach(() => {
        autoplayCounters.clear()
        jest.clearAllMocks()
    })

    describe('getAutoplayCount', () => {
        test('returns 0 when guild has no count', async () => {
            mockGetAutoplayCounter.mockResolvedValue(null)

            const result = await getAutoplayCount('guild-1')

            expect(result).toBe(0)
        })

        test('returns count from Redis when available', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 42 })

            const result = await getAutoplayCount('guild-1')

            expect(result).toBe(42)
        })

        test('returns count from memory map when Redis is unavailable', async () => {
            autoplayCounters.set('guild-1', 25)
            mockGetAutoplayCounter.mockRejectedValue(new Error('Redis error'))

            const result = await getAutoplayCount('guild-1')

            expect(result).toBe(25)
        })

        test('returns 0 when both Redis and memory are empty', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Redis error'))

            const result = await getAutoplayCount('guild-2')

            expect(result).toBe(0)
        })

        test('logs error when Redis fails', async () => {
            mockGetAutoplayCounter.mockRejectedValue(new Error('Redis error'))

            await getAutoplayCount('guild-1')

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error getting autoplay count:',
                }),
            )
        })

        test('prefers Redis value over memory when both exist', async () => {
            autoplayCounters.set('guild-1', 10)
            mockGetAutoplayCounter.mockResolvedValue({ count: 50 })

            const result = await getAutoplayCount('guild-1')

            expect(result).toBe(50)
        })
    })

    describe('incrementAutoplayCount', () => {
        test('increments count in memory', async () => {
            mockIncrementAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 5)

            const result = await incrementAutoplayCount('guild-1', 1)

            expect(result).toBe(6)
            expect(autoplayCounters.get('guild-1')).toBe(6)
        })

        test('increments by custom amount', async () => {
            mockIncrementAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 10)

            const result = await incrementAutoplayCount('guild-1', 5)

            expect(result).toBe(15)
        })

        test('defaults to increment of 1', async () => {
            mockIncrementAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 8)

            const result = await incrementAutoplayCount('guild-1')

            expect(result).toBe(9)
        })

        test('initializes counter from 0 if not present', async () => {
            mockIncrementAutoplayCounter.mockResolvedValue(undefined)

            const result = await incrementAutoplayCount('guild-1', 1)

            expect(result).toBe(1)
        })

        test('calls guildSettingsService.incrementAutoplayCounter', async () => {
            mockIncrementAutoplayCounter.mockResolvedValue(undefined)

            await incrementAutoplayCount('guild-1', 1)

            expect(mockIncrementAutoplayCounter).toHaveBeenCalledWith('guild-1')
        })

        test('logs debug message on success', async () => {
            mockIncrementAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 5)

            await incrementAutoplayCount('guild-1', 1)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Incremented autoplay count for guild guild-1',
                    data: expect.objectContaining({
                        newCount: 6,
                    }),
                }),
            )
        })

        test('returns memory count when service fails', async () => {
            autoplayCounters.set('guild-1', 5)
            mockIncrementAutoplayCounter.mockRejectedValue(
                new Error('Service error'),
            )

            const result = await incrementAutoplayCount('guild-1', 2)

            expect(result).toBe(5)
        })

        test('logs error when increment fails', async () => {
            mockIncrementAutoplayCounter.mockRejectedValue(
                new Error('Service error'),
            )

            await incrementAutoplayCount('guild-1', 1)

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error incrementing autoplay count:',
                }),
            )
        })
    })

    describe('resetAutoplayCount', () => {
        test('sets counter to 0 in memory', async () => {
            mockResetAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 100)

            await resetAutoplayCount('guild-1')

            expect(autoplayCounters.get('guild-1')).toBe(0)
        })

        test('calls guildSettingsService.resetAutoplayCounter', async () => {
            mockResetAutoplayCounter.mockResolvedValue(undefined)

            await resetAutoplayCount('guild-1')

            expect(mockResetAutoplayCounter).toHaveBeenCalledWith('guild-1')
        })

        test('logs debug message on success', async () => {
            mockResetAutoplayCounter.mockResolvedValue(undefined)

            await resetAutoplayCount('guild-1')

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Reset autoplay count for guild guild-1',
                }),
            )
        })

        test('logs error when reset fails', async () => {
            mockResetAutoplayCounter.mockRejectedValue(
                new Error('Service error'),
            )

            await resetAutoplayCount('guild-1')

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error resetting autoplay count:',
                }),
            )
        })

        test('resets multiple guilds independently', async () => {
            mockResetAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 50)
            autoplayCounters.set('guild-2', 75)

            await resetAutoplayCount('guild-1')

            expect(autoplayCounters.get('guild-1')).toBe(0)
            expect(autoplayCounters.get('guild-2')).toBe(75)
        })
    })

    describe('clearAllAutoplayCounters', () => {
        test('clears memory map', async () => {
            mockClearAllAutoplayCounters.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 10)
            autoplayCounters.set('guild-2', 20)

            await clearAllAutoplayCounters()

            expect(autoplayCounters.size).toBe(0)
        })

        test('calls guildSettingsService.clearAllAutoplayCounters', async () => {
            mockClearAllAutoplayCounters.mockResolvedValue(undefined)

            await clearAllAutoplayCounters()

            expect(mockClearAllAutoplayCounters).toHaveBeenCalled()
        })

        test('logs debug message on success', async () => {
            mockClearAllAutoplayCounters.mockResolvedValue(undefined)

            await clearAllAutoplayCounters()

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cleared all autoplay counters',
                }),
            )
        })

        test('logs error when clear fails', async () => {
            mockClearAllAutoplayCounters.mockRejectedValue(
                new Error('Service error'),
            )

            await clearAllAutoplayCounters()

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error clearing autoplay counters:',
                }),
            )
        })

        test('clears map even if service fails', async () => {
            mockClearAllAutoplayCounters.mockRejectedValue(
                new Error('Service error'),
            )
            autoplayCounters.set('guild-1', 10)

            await clearAllAutoplayCounters()

            expect(autoplayCounters.size).toBe(0)
        })
    })
})
