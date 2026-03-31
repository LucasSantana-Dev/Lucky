import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    autoplayCounters,
    getAutoplayCount,
    incrementAutoplayCount,
    resetAutoplayCount,
    clearAllAutoplayCounters,
} from './counters'

const getAutoplayCounterMock = jest.fn()
const incrementAutoplayCounterMock = jest.fn()
const resetAutoplayCounterMock = jest.fn()
const clearAllAutoplayCountersMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getAutoplayCounter: (...args: unknown[]) =>
            getAutoplayCounterMock(...args),
        incrementAutoplayCounter: (...args: unknown[]) =>
            incrementAutoplayCounterMock(...args),
        resetAutoplayCounter: (...args: unknown[]) =>
            resetAutoplayCounterMock(...args),
        clearAllAutoplayCounters: (...args: unknown[]) =>
            clearAllAutoplayCountersMock(...args),
    },
}))

describe('autoplay counters', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        autoplayCounters.clear()
    })

    describe('getAutoplayCount', () => {
        it('returns count from redis when available', async () => {
            getAutoplayCounterMock.mockResolvedValue({ count: 42 })

            const result = await getAutoplayCount('guild-1')

            expect(result).toBe(42)
            expect(getAutoplayCounterMock).toHaveBeenCalledWith('guild-1')
        })

        it('falls back to local map when redis returns null', async () => {
            getAutoplayCounterMock.mockResolvedValue(null)
            autoplayCounters.set('guild-2', 10)

            const result = await getAutoplayCount('guild-2')

            expect(result).toBe(10)
        })

        it('returns 0 when no count exists anywhere', async () => {
            getAutoplayCounterMock.mockResolvedValue(null)

            const result = await getAutoplayCount('guild-3')

            expect(result).toBe(0)
        })

        it('returns 0 and falls back when redis throws', async () => {
            getAutoplayCounterMock.mockRejectedValue(new Error('redis error'))
            autoplayCounters.set('guild-4', 5)

            const result = await getAutoplayCount('guild-4')

            expect(result).toBe(5)
            expect(errorLogMock).toHaveBeenCalled()
        })

        it('returns 0 from local map when redis throws and no local count', async () => {
            getAutoplayCounterMock.mockRejectedValue(new Error('redis error'))

            const result = await getAutoplayCount('guild-5')

            expect(result).toBe(0)
        })
    })

    describe('incrementAutoplayCount', () => {
        it('increments local counter by default amount (1)', async () => {
            incrementAutoplayCounterMock.mockResolvedValue(undefined)

            await incrementAutoplayCount('guild-6')

            expect(autoplayCounters.get('guild-6')).toBe(1)
        })

        it('increments local counter by custom amount', async () => {
            incrementAutoplayCounterMock.mockResolvedValue(undefined)

            await incrementAutoplayCount('guild-7', 5)

            expect(autoplayCounters.get('guild-7')).toBe(5)
        })

        it('persists increment to redis', async () => {
            incrementAutoplayCounterMock.mockResolvedValue(undefined)

            await incrementAutoplayCount('guild-8', 3)

            expect(incrementAutoplayCounterMock).toHaveBeenCalledWith('guild-8')
        })

        it('logs debug message on success', async () => {
            incrementAutoplayCounterMock.mockResolvedValue(undefined)

            await incrementAutoplayCount('guild-9')

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Incremented autoplay count for guild guild-9',
                    ),
                }),
            )
        })

        it('returns incremented count', async () => {
            incrementAutoplayCounterMock.mockResolvedValue(undefined)
            autoplayCounters.set('guild-10', 5)

            const result = await incrementAutoplayCount('guild-10', 3)

            expect(result).toBe(8)
        })

        it('falls back to local count when redis fails', async () => {
            incrementAutoplayCounterMock.mockRejectedValue(
                new Error('redis error'),
            )
            autoplayCounters.set('guild-11', 2)

            const result = await incrementAutoplayCount('guild-11', 1)

            expect(result).toBe(2)
            expect(errorLogMock).toHaveBeenCalled()
        })

        it('returns 0 when redis fails and no local count', async () => {
            incrementAutoplayCounterMock.mockRejectedValue(
                new Error('redis error'),
            )

            const result = await incrementAutoplayCount('guild-12', 1)

            expect(result).toBe(0)
        })

        it('updates existing counter', async () => {
            incrementAutoplayCounterMock.mockResolvedValue(undefined)
            autoplayCounters.set('guild-13', 10)

            await incrementAutoplayCount('guild-13', 5)

            expect(autoplayCounters.get('guild-13')).toBe(15)
        })
    })

    describe('resetAutoplayCount', () => {
        it('sets local counter to 0', async () => {
            resetAutoplayCounterMock.mockResolvedValue(undefined)
            autoplayCounters.set('guild-14', 100)

            await resetAutoplayCount('guild-14')

            expect(autoplayCounters.get('guild-14')).toBe(0)
        })

        it('calls redis to reset counter', async () => {
            resetAutoplayCounterMock.mockResolvedValue(undefined)

            await resetAutoplayCount('guild-15')

            expect(resetAutoplayCounterMock).toHaveBeenCalledWith('guild-15')
        })

        it('logs debug message on success', async () => {
            resetAutoplayCounterMock.mockResolvedValue(undefined)

            await resetAutoplayCount('guild-16')

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Reset autoplay count for guild guild-16',
                    ),
                }),
            )
        })

        it('logs error when redis fails', async () => {
            resetAutoplayCounterMock.mockRejectedValue(new Error('redis error'))

            await resetAutoplayCount('guild-17')

            expect(errorLogMock).toHaveBeenCalled()
        })

        it('logs error when redis fails', async () => {
            resetAutoplayCounterMock.mockRejectedValue(new Error('redis error'))
            autoplayCounters.set('guild-18', 50)

            await resetAutoplayCount('guild-18')

            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('clearAllAutoplayCounters', () => {
        it('clears the local map', async () => {
            clearAllAutoplayCountersMock.mockResolvedValue(undefined)
            autoplayCounters.set('guild-19', 10)
            autoplayCounters.set('guild-20', 20)

            await clearAllAutoplayCounters()

            expect(autoplayCounters.size).toBe(0)
        })

        it('calls redis to clear all counters', async () => {
            clearAllAutoplayCountersMock.mockResolvedValue(undefined)

            await clearAllAutoplayCounters()

            expect(clearAllAutoplayCountersMock).toHaveBeenCalled()
        })

        it('logs debug message on success', async () => {
            clearAllAutoplayCountersMock.mockResolvedValue(undefined)

            await clearAllAutoplayCounters()

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Cleared all autoplay counters',
                }),
            )
        })

        it('logs error when redis fails', async () => {
            clearAllAutoplayCountersMock.mockRejectedValue(
                new Error('redis error'),
            )

            await clearAllAutoplayCounters()

            expect(errorLogMock).toHaveBeenCalled()
        })

        it('still clears local map even when redis fails', async () => {
            clearAllAutoplayCountersMock.mockRejectedValue(
                new Error('redis error'),
            )
            autoplayCounters.set('guild-21', 10)
            autoplayCounters.set('guild-22', 20)

            await clearAllAutoplayCounters()

            expect(autoplayCounters.size).toBe(0)
        })
    })
})
