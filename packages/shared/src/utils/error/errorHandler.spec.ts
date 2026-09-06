import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { handleError, createUserErrorMessage } from './errorHandler'
import { MusicError } from '../../types/errors/music'
import { errorLog } from '../general/log'
import { captureException } from '../monitoring'

// Mock dependencies
jest.mock('../general/log', () => ({
    errorLog: jest.fn(),
}))

jest.mock('../monitoring', () => ({
    captureException: jest.fn(),
}))

describe('Error Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('handleError', () => {
        it('should handle a regular Error', () => {
            const error = new Error('Test error')
            const context = { userId: 'user123', guildId: 'guild456' }

            const result = handleError(error, context)

            expect(result).toBeInstanceOf(MusicError)
            expect(result.message).toBe('Test error')
            expect(result.metadata.userId).toBe('user123')
            expect(result.metadata.guildId).toBe('guild456')
            expect(errorLog).toHaveBeenCalled()
            expect(captureException).toHaveBeenCalled()
        })

        it('should handle a MusicError', () => {
            const error = new MusicError(
                'Music error',
                'ERR_MUSIC_TRACK_NOT_FOUND',
            )
            const context = { userId: 'user123' }

            const result = handleError(error, context)

            expect(result).toBe(error) // Should return the same error
            expect(errorLog).toHaveBeenCalled()
            expect(captureException).toHaveBeenCalled()
        })

        it('should handle a string error', () => {
            const error = 'String error'
            const result = handleError(error)

            expect(result).toBeInstanceOf(MusicError)
            expect(result.message).toBe('String error')
        })

        it('should handle unknown error', () => {
            const error = { some: 'object' }
            const result = handleError(error)

            expect(result).toBeInstanceOf(MusicError)
            expect(result.message).toBe('[object Object]')
        })

        it('should include correlation ID in context', () => {
            const error = new Error('Test error')
            const context = { correlationId: 'test-correlation-123' }

            const result = handleError(error, context)

            expect(result.metadata.correlationId).toBe('test-correlation-123')
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handled',
                error: result,
                correlationId: 'test-correlation-123',
            })
        })

        it('should generate correlation ID if not provided', () => {
            const error = new Error('Test error')
            const result = handleError(error)

            expect(result.metadata.correlationId).toBeDefined()
            expect(typeof result.metadata.correlationId).toBe('string')
        })
    })

    describe('createUserErrorMessage', () => {
        it('should return message for MusicError', () => {
            const error = new MusicError('User-friendly message')
            const result = createUserErrorMessage(error)

            expect(result).toBe('User-friendly message')
        })

        it('should map timeout errors to user-friendly message', () => {
            const error = new Error('Request timeout occurred')
            const result = createUserErrorMessage(error)

            expect(result).toBe('The request timed out. Please try again.')
        })

        it('should map network errors to user-friendly message', () => {
            const error = new Error('network connection failed')
            const result = createUserErrorMessage(error)

            expect(result).toBe(
                'Network error occurred. Please check your connection.',
            )
        })

        it('should map permission errors to user-friendly message', () => {
            const error = new Error('permission denied')
            const result = createUserErrorMessage(error)

            expect(result).toBe(
                "You don't have permission to perform this action.",
            )
        })

        it('should return generic message for unknown errors', () => {
            const error = new Error('Unknown error')
            const result = createUserErrorMessage(error)

            expect(result).toBe(
                'An unexpected error occurred. Please try again.',
            )
        })

        it('should handle non-Error objects', () => {
            const error = 'String error'
            const result = createUserErrorMessage(error)

            expect(result).toBe(
                'An unexpected error occurred. Please try again.',
            )
        })
    })

    describe('Integration tests', () => {
        it('should handle complete error flow', () => {
            const error = new Error('network timeout')
            const context = { userId: 'user123', guildId: 'guild456' }

            const handledError = handleError(error, context)
            const userMessage = createUserErrorMessage(handledError)

            expect(handledError).toBeInstanceOf(MusicError)
            expect(userMessage).toBe('network timeout')
        })

        it('should handle MusicError flow', () => {
            const error = new MusicError(
                'Playback failed',
                'ERR_MUSIC_PLAYBACK_FAILED',
            )
            const context = { userId: 'user123' }

            const handledError = handleError(error, context)
            const userMessage = createUserErrorMessage(handledError)

            expect(handledError).toBe(error) // Same error returned
            expect(userMessage).toBe('Playback failed')
        })
    })
})
