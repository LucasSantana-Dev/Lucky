import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { withRetry } from './retryHandler'
import type { RetryOptions } from './types'
import { MusicError } from '../../types/errors/music'

describe('Retry Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('withRetry', () => {
        it('should succeed on first attempt', async () => {
            const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success')
            const options: RetryOptions = { maxAttempts: 3, delayMs: 100, backoffMultiplier: 2 }

            const result = await withRetry(mockFn, options)

            expect(result).toBe('success')
            expect(mockFn).toHaveBeenCalledTimes(1)
        })

        it('should retry on failure and eventually succeed', async () => {
            const mockFn = jest.fn<() => Promise<string>>()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue('success')
            const options: RetryOptions = { maxAttempts: 3, delayMs: 100, backoffMultiplier: 2 }

            const result = await withRetry(mockFn, options)

            expect(result).toBe('success')
            expect(mockFn).toHaveBeenCalledTimes(3)
        })

        it('should fail after max attempts', async () => {
            const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Network error'))
            const options: RetryOptions = { maxAttempts: 2, delayMs: 100, backoffMultiplier: 2 }

            await expect(withRetry(mockFn, options)).rejects.toThrow('Network error')
            expect(mockFn).toHaveBeenCalledTimes(2)
        })

        it('should not retry non-retryable errors', async () => {
            const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Invalid input'))
            const options: RetryOptions = { maxAttempts: 3, delayMs: 100, backoffMultiplier: 2 }

            await expect(withRetry(mockFn, options)).rejects.toThrow('Invalid input')
            expect(mockFn).toHaveBeenCalledTimes(1)
        })

        it('should use exponential backoff', async () => {
            const mockFn = jest.fn<() => Promise<string>>()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue('success')
            const options: RetryOptions = { maxAttempts: 3, delayMs: 100, backoffMultiplier: 2 }

            const startTime = Date.now()
            const result = await withRetry(mockFn, options)
            const endTime = Date.now()

            expect(result).toBe('success')
            expect(mockFn).toHaveBeenCalledTimes(3)
            // Should have waited at least 100ms + 200ms = 300ms
            expect(endTime - startTime).toBeGreaterThanOrEqual(300)
        })

        it('should handle rate limit errors with longer delays', async () => {
            const mockFn = jest.fn<() => Promise<string>>()
                .mockRejectedValueOnce(new Error('Rate limit exceeded'))
                .mockResolvedValue('success')
            const options: RetryOptions = { maxAttempts: 2, delayMs: 100, backoffMultiplier: 2 }

            const startTime = Date.now()
            const result = await withRetry(mockFn, options)
            const endTime = Date.now()

            expect(result).toBe('success')
            expect(mockFn).toHaveBeenCalledTimes(2)
            // Should have waited at least 100ms
            expect(endTime - startTime).toBeGreaterThanOrEqual(100)
        })

        it('should handle MusicError with retry logic', async () => {
            const mockFn = jest.fn<() => Promise<string>>()
                .mockRejectedValueOnce(new MusicError('Playback failed', 'ERR_MUSIC_PLAYBACK_FAILED'))
                .mockResolvedValue('success')
            const options: RetryOptions = { maxAttempts: 2, delayMs: 100, backoffMultiplier: 2 }

            const result = await withRetry(mockFn, options)

            expect(result).toBe('success')
            expect(mockFn).toHaveBeenCalledTimes(2)
        })

        it('should not retry non-retryable MusicError', async () => {
            const mockFn = jest.fn<() => Promise<string>>()
                .mockRejectedValue(new MusicError('Track not found', 'ERR_MUSIC_TRACK_NOT_FOUND'))
            const options: RetryOptions = { maxAttempts: 3, delayMs: 100, backoffMultiplier: 2 }

            await expect(withRetry(mockFn, options)).rejects.toThrow('Track not found')
            expect(mockFn).toHaveBeenCalledTimes(1)
        })
    })
})
