import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { safeSetInterval, safeSetTimeout, clearAllTimers } from './timerManager'

describe('Timer Manager', () => {
    beforeEach(() => {
        jest.clearAllTimers()
        jest.useFakeTimers()
        clearAllTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('safeSetInterval', () => {
        it('should create and track intervals', () => {
            const mockFn = jest.fn()
            const id = safeSetInterval(mockFn, 1000)

            expect(id).toBeDefined()
            expect(mockFn).not.toHaveBeenCalled()

            jest.advanceTimersByTime(1000)
            expect(mockFn).toHaveBeenCalledTimes(1)

            jest.advanceTimersByTime(1000)
            expect(mockFn).toHaveBeenCalledTimes(2)
        })

        it('should track multiple intervals', () => {
            const mockFn1 = jest.fn()
            const mockFn2 = jest.fn()

            const id1 = safeSetInterval(mockFn1, 1000)
            const id2 = safeSetInterval(mockFn2, 2000)

            expect(id1).not.toBe(id2)

            jest.advanceTimersByTime(1000)
            expect(mockFn1).toHaveBeenCalledTimes(1)
            expect(mockFn2).not.toHaveBeenCalled()

            jest.advanceTimersByTime(1000)
            expect(mockFn1).toHaveBeenCalledTimes(2)
            expect(mockFn2).toHaveBeenCalledTimes(1)
        })
    })

    describe('safeSetTimeout', () => {
        it('should create and track timeouts', () => {
            const mockFn = jest.fn()
            const id = safeSetTimeout(mockFn, 1000)

            expect(id).toBeDefined()
            expect(mockFn).not.toHaveBeenCalled()

            jest.advanceTimersByTime(1000)
            expect(mockFn).toHaveBeenCalledTimes(1)

            // Should not be called again
            jest.advanceTimersByTime(1000)
            expect(mockFn).toHaveBeenCalledTimes(1)
        })

        it('should track multiple timeouts', () => {
            const mockFn1 = jest.fn()
            const mockFn2 = jest.fn()

            const id1 = safeSetTimeout(mockFn1, 1000)
            const id2 = safeSetTimeout(mockFn2, 2000)

            expect(id1).not.toBe(id2)

            jest.advanceTimersByTime(1000)
            expect(mockFn1).toHaveBeenCalledTimes(1)
            expect(mockFn2).not.toHaveBeenCalled()

            jest.advanceTimersByTime(1000)
            expect(mockFn1).toHaveBeenCalledTimes(1)
            expect(mockFn2).toHaveBeenCalledTimes(1)
        })
    })

    describe('clearAllTimers', () => {
        it('should clear all intervals and timeouts', () => {
            const mockFn1 = jest.fn()
            const mockFn2 = jest.fn()
            const mockFn3 = jest.fn()

            safeSetInterval(mockFn1, 1000)
            safeSetTimeout(mockFn2, 1000)
            safeSetTimeout(mockFn3, 2000)

            clearAllTimers()

            jest.advanceTimersByTime(5000)
            expect(mockFn1).not.toHaveBeenCalled()
            expect(mockFn2).not.toHaveBeenCalled()
            expect(mockFn3).not.toHaveBeenCalled()
        })

        it('should reset internal arrays', () => {
            const mockFn = jest.fn()
            safeSetInterval(mockFn, 1000)
            safeSetTimeout(mockFn, 1000)

            clearAllTimers()

            // Should be able to create new timers after clearing
            const newMockFn = jest.fn()
            const id = safeSetInterval(newMockFn, 1000)
            expect(id).toBeDefined()
        })
    })

    describe('mixed timers', () => {
        it('should handle both intervals and timeouts together', () => {
            const intervalFn = jest.fn()
            const timeoutFn = jest.fn()

            safeSetInterval(intervalFn, 1000)
            safeSetTimeout(timeoutFn, 1500)

            jest.advanceTimersByTime(1000)
            expect(intervalFn).toHaveBeenCalledTimes(1)
            expect(timeoutFn).not.toHaveBeenCalled()

            jest.advanceTimersByTime(500)
            expect(intervalFn).toHaveBeenCalledTimes(1)
            expect(timeoutFn).toHaveBeenCalledTimes(1)

            jest.advanceTimersByTime(1000)
            expect(intervalFn).toHaveBeenCalledTimes(2)
            expect(timeoutFn).toHaveBeenCalledTimes(1)
        })
    })
})
