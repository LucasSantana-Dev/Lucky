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

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
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
        mockGetAutoplayCounter = guildSettingsService.getAutoplayCounter as jest.Mock
        mockIncrementAutoplayCounter = guildSettingsService.incrementAutoplayCounter as jest.Mock
        mockResetAutoplayCounter = guildSettingsService.resetAutoplayCounter as jest.Mock
        mockClearAllAutoplayCounters = guildSettingsService.clearAllAutoplayCounters as jest.Mock
    })

    afterEach(() => {
        autoplayCounters.clear()
    })

    describe('getAutoplayCount', () => {
        test('returns 0 when guild has no count', async () => {
            mockGetAutoplayCounter.mockResolvedValue(null)
            expect(await getAutoplayCount('guild-1')).toBe(0)
        })

        test('returns count from Redis when available', async () => {
            mockGetAutoplayCounter.mockResolvedValue({ count: 42 })
            expect(await getAutoplayCount('guild-1')).toBe(42)
        })

        test('falls back to memory map when Redis fails', async () => {
            autoplayCounters.set('guild-1', 25)
            mockGetAutoplayCounter.mockRejectedValue(new Error('Redis error'))
            expect(await getAutoplayCount('guild-1')).toBe(25)
        })

        test('prefers Redis value over in-memory when both exist', async () => {
            autoplayCounters.set('guild-1', 10)
            mockGetAutoplayCounter.mockResolvedValue({ count: 50 })
            expect(await getAutoplayCount('guild-1')).toBe(50)
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

        test('initializes counter from 0 if not present', async () => {
            mockIncrementAutoplayCounter.mockResolvedValue(undefined)
            expect(await incrementAutoplayCount('guild-1', 1)).toBe(1)
        })

        test('returns unchanged memory count when service fails', async () => {
            autoplayCounters.set('guild-1', 5)
            mockIncrementAutoplayCounter.mockRejectedValue(new Error('Service error'))
            expect(await incrementAutoplayCount('guild-1', 2)).toBe(5)
        })
    })

    describe('resetAutoplayCount', () => {
        test('sets counter to 0 in memory', async () => {
            mockResetAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 100)
            await resetAutoplayCount('guild-1')
            expect(autoplayCounters.get('guild-1')).toBe(0)
        })

        test('resets guilds independently without affecting others', async () => {
            mockResetAutoplayCounter.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 50)
            autoplayCounters.set('guild-2', 75)
            await resetAutoplayCount('guild-1')
            expect(autoplayCounters.get('guild-1')).toBe(0)
            expect(autoplayCounters.get('guild-2')).toBe(75)
        })
    })

    describe('clearAllAutoplayCounters', () => {
        test('clears all guild counters from memory', async () => {
            mockClearAllAutoplayCounters.mockResolvedValue(undefined)
            autoplayCounters.set('guild-1', 10)
            autoplayCounters.set('guild-2', 20)
            await clearAllAutoplayCounters()
            expect(autoplayCounters.size).toBe(0)
        })

        test('clears memory map even if service fails', async () => {
            mockClearAllAutoplayCounters.mockRejectedValue(new Error('Service error'))
            autoplayCounters.set('guild-1', 10)
            await clearAllAutoplayCounters()
            expect(autoplayCounters.size).toBe(0)
        })
    })
})
