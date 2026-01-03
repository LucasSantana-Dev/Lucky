/**
 * Unit tests for logging utilities
 * Following quality rules: test behavior, not implementation
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
    LogLevel,
    errorLog,
    infoLog,
    successLog,
    warnLog,
    debugLog,
} from './index'

describe('Log Utilities', () => {
    let mockConsole: jest.SpiedFunction<typeof console.log>

    beforeEach(() => {
        mockConsole = jest.spyOn(console, 'log').mockImplementation(() => {})
        jest.spyOn(console, 'error').mockImplementation(() => {})
        jest.spyOn(console, 'warn').mockImplementation(() => {})
        jest.spyOn(console, 'debug').mockImplementation(() => {})
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should log info messages', () => {
        infoLog({ message: 'Test info message' })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should log error messages', () => {
        const error = new Error('Test error')
        errorLog({ message: 'Test error message', error })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should log warning messages', () => {
        warnLog({ message: 'Test warning message' })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should log debug messages', () => {
        debugLog({ message: 'Test debug message' })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should log success messages', () => {
        successLog({ message: 'Test success message' })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should handle logging with additional data', () => {
        const additionalData = { userId: 'user123', guildId: 'guild456' }
        infoLog({ message: 'Test message', data: additionalData })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should handle error logging with stack trace', () => {
        const error = new Error('Test error')
        error.stack = 'Error: Test error\n    at test.js:1:1'
        errorLog({ message: 'Error occurred', error })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should handle null/undefined values in logging', () => {
        infoLog({ message: 'Test with null', data: null })
        errorLog({ message: 'Test with undefined', error: undefined })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should handle empty messages', () => {
        infoLog({ message: '' })
        errorLog({ message: '', error: new Error('test') })
        expect(mockConsole).toHaveBeenCalled()
    })

    it('should have correct log level constants', () => {
        expect(LogLevel.ERROR).toBe(0)
        expect(LogLevel.WARN).toBe(1)
        expect(LogLevel.INFO).toBe(2)
        expect(LogLevel.SUCCESS).toBe(3)
        expect(LogLevel.DEBUG).toBe(4)
    })
})
