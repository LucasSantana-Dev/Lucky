import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock dependencies
jest.mock('../general/log', () => ({
    errorLog: jest.fn(),
}))

jest.mock('../monitoring', () => ({
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
}))

// Mock uuid
jest.doMock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-12345'),
}))

import {
    createCorrelationId,
    wrapError,
    createUserErrorMessage,
    logError
} from './errorWrapper'
import { MusicError } from '../../types/errors/music'
import { VALIDATION_ERROR_CODES } from '../../types/errors/validation'
import { errorLog } from '../general/log'
import { captureException } from '../monitoring'

describe('Error Wrapper', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('createCorrelationId', () => {
        it('should generate a correlation ID', () => {
            const id = createCorrelationId()

            expect(id).toBeDefined()
            expect(typeof id).toBe('string')
            expect(id.length).toBeGreaterThan(0)
        })

        it('should call uuid.v4', () => {
            const { v4 } = require('uuid')
            createCorrelationId()
            expect(v4).toHaveBeenCalled()
        })
    })

    describe('wrapError', () => {
        it('should return MusicError as-is', () => {
            const error = new MusicError('Test error', 'ERR_MUSIC_TRACK_NOT_FOUND')
            const result = wrapError(error)

            expect(result).toBe(error)
        })

        it('should wrap Error into MusicError', () => {
            const error = new Error('Test error')
            const result = wrapError(error)

            expect(result).toBeInstanceOf(MusicError)
            expect(result.message).toBe('Test error')
            expect(result.code).toBe(VALIDATION_ERROR_CODES.VALIDATION_INVALID_INPUT)
        })

        it('should wrap string into MusicError', () => {
            const error = 'String error'
            const result = wrapError(error)

            expect(result).toBeInstanceOf(MusicError)
            expect(result.message).toBe('String error')
        })

        it('should wrap object into MusicError', () => {
            const error = { some: 'object' }
            const result = wrapError(error)

            expect(result).toBeInstanceOf(MusicError)
            expect(result.message).toBe('[object Object]')
        })

        it('should include context in metadata', () => {
            const error = new Error('Test error')
            const context = {
                userId: 'user123',
                guildId: 'guild456',
                commandName: 'play',
                correlationId: 'test-correlation-123',
                additionalInfo: { extra: 'data' }
            }

            const result = wrapError(error, undefined, context)

            expect(result.metadata.userId).toBe('user123')
            expect(result.metadata.guildId).toBe('guild456')
            expect(result.metadata.commandName).toBe('play')
            expect(result.metadata.correlationId).toBe('test-correlation-123')
            expect(result.metadata.details).toEqual({ extra: 'data' })
        })

        it('should generate correlation ID if not provided in context', () => {
            const error = new Error('Test error')
            const context = { userId: 'user123' }

            const result = wrapError(error, undefined, context)

            expect(result.metadata.correlationId).toBeDefined()
            expect(typeof result.metadata.correlationId).toBe('string')
        })

        it('should use provided error code', () => {
            const error = new Error('Test error')
            const code = VALIDATION_ERROR_CODES.VALIDATION_INVALID_INPUT

            const result = wrapError(error, code)

            expect(result.code).toBe(code)
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

            expect(result).toBe('Network error occurred. Please check your connection.')
        })

        it('should map permission errors to user-friendly message', () => {
            const error = new Error('permission denied')
            const result = createUserErrorMessage(error)

            expect(result).toBe("You don't have permission to perform this action.")
        })

        it('should return generic message for unknown errors', () => {
            const error = new Error('Unknown error')
            const result = createUserErrorMessage(error)

            expect(result).toBe('An unexpected error occurred. Please try again.')
        })

        it('should handle non-Error objects', () => {
            const error = 'String error'
            const result = createUserErrorMessage(error)

            expect(result).toBe('An unexpected error occurred. Please try again.')
        })
    })

    describe('logError', () => {
        it('should log error and capture exception', () => {
            const error = new Error('Test error')
            const context = { userId: 'user123' }

            logError(error, context)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error occurred',
                error: expect.any(MusicError),
                correlationId: expect.any(String),
            })
            expect(captureException).toHaveBeenCalledWith(
                expect.any(MusicError),
                {
                    correlationId: expect.any(String),
                    context,
                }
            )
        })

        it('should handle error without context', () => {
            const error = new Error('Test error')

            logError(error)

            expect(errorLog).toHaveBeenCalled()
            expect(captureException).toHaveBeenCalled()
        })

        it('should use provided correlation ID', () => {
            const error = new Error('Test error')
            const context = { correlationId: 'test-correlation-123' }

            logError(error, context)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error occurred',
                error: expect.any(MusicError),
                correlationId: 'test-correlation-123',
            })
        })
    })

    describe('Integration tests', () => {
        it('should handle complete error wrapping flow', () => {
            const error = new Error('network timeout')
            const context = { userId: 'user123', guildId: 'guild456' }

            const wrappedError = wrapError(error, undefined, context)
            const userMessage = createUserErrorMessage(wrappedError)

            expect(wrappedError).toBeInstanceOf(MusicError)
            expect(wrappedError.message).toBe('network timeout')
            expect(wrappedError.metadata.userId).toBe('user123')
            expect(wrappedError.metadata.guildId).toBe('guild456')
            expect(userMessage).toBe('network timeout')
        })

        it('should handle MusicError without wrapping', () => {
            const error = new MusicError('Music error', 'ERR_MUSIC_TRACK_NOT_FOUND')
            const context = { userId: 'user123' }

            const wrappedError = wrapError(error, undefined, context)
            const userMessage = createUserErrorMessage(wrappedError)

            expect(wrappedError).toBe(error) // Same error
            expect(userMessage).toBe('Music error')
        })
    })
})
