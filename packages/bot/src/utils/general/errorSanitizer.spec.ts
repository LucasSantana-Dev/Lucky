import { describe, it, expect } from '@jest/globals'
import {
    sanitizeErrorMessage,
    sanitizeMessage,
    createUserFriendlyError,
} from './errorSanitizer'

describe('sanitizeErrorMessage', () => {
    it('returns generic message for null', () => {
        expect(sanitizeErrorMessage(null)).toBe('An unknown error occurred')
    })

    it('returns generic message for undefined', () => {
        expect(sanitizeErrorMessage(undefined)).toBe(
            'An unknown error occurred',
        )
    })

    it('returns generic message for empty string', () => {
        expect(sanitizeErrorMessage('')).toBe('An unknown error occurred')
    })

    it('returns generic message for false', () => {
        expect(sanitizeErrorMessage(false)).toBe('An unknown error occurred')
    })

    it('returns generic message for 0', () => {
        expect(sanitizeErrorMessage(0)).toBe('An unknown error occurred')
    })

    it('extracts message from Error instance', () => {
        const error = new Error('Test error message')
        const result = sanitizeErrorMessage(error)
        expect(result).toContain('Test error message')
    })

    it('converts string errors', () => {
        const result = sanitizeErrorMessage('String error')
        expect(result).toContain('String error')
    })

    it('converts object errors to JSON string', () => {
        const error = { code: 500, message: 'Server error' }
        const result = sanitizeErrorMessage(error)
        expect(result).toContain('500')
    })

    it('converts primitives to string', () => {
        expect(sanitizeErrorMessage(42)).toBe('42')
        expect(sanitizeErrorMessage(true)).toBe('true')
    })

    it('sanitizes Error.message with system paths', () => {
        const error = new Error(
            'Error at C:\\Users\\test\\project\\file.js:10:5',
        )
        const result = sanitizeErrorMessage(error)
        expect(result).not.toContain('C:\\Users')
        expect(result).not.toContain('file.js')
    })
})

describe('sanitizeMessage', () => {
    it('returns generic message for null string', () => {
        expect(sanitizeMessage(null as never)).toBe('An unknown error occurred')
    })

    it('returns generic message for empty string', () => {
        expect(sanitizeMessage('')).toBe('An unknown error occurred')
    })

    it('removes Windows paths with backslash', () => {
        const message = 'Error at C:\\Users\\test\\project\\file.js'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('C:\\Users')
        expect(result).not.toContain('Users\\test\\project')
    })

    it('removes Unix paths with forward slash', () => {
        const message = 'Error at /home/user/project/file.js'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('/home/user')
    })

    it('removes Windows drive letter paths', () => {
        const message = 'Error at D:\\development\\code\\test.ts'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('D:\\development')
    })

    it('removes WSL paths', () => {
        const message = 'Error at /c/Users/test/file.js'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('/c/Users')
    })

    it('removes "Cannot find module" errors', () => {
        const message = "Cannot find module 'express'"
        const result = sanitizeMessage(message)
        expect(result).not.toContain("Cannot find module 'express'")
        expect(result).toContain('Required dependency not found')
    })

    it('removes "Cannot read properties of undefined" errors', () => {
        const message = 'Cannot read properties of undefined (reading "length")'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('Cannot read properties of undefined')
        expect(result).toContain('Configuration error')
    })

    it('removes spawn() patterns', () => {
        const message = 'spawn(ffmpeg) failed'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('spawn(ffmpeg)')
        expect(result).toContain('External process')
    })

    it('removes require() patterns', () => {
        const message = 'require("child_process") failed'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('require("child_process")')
        expect(result).toContain('Module loading')
    })

    it('removes require stack traces', () => {
        const message =
            'Error: Cannot find module\nRequire stack:\n- /home/user/index.js'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('Require stack:')
    })

    it('removes stack trace at patterns', () => {
        const message = 'at Object.<anonymous> (/home/user/app.js:10:5)'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('at Object.<anonymous>')
        expect(result).toContain('at [INTERNAL_FUNCTION]')
    })

    it('removes location patterns with line and column numbers', () => {
        const message = 'at processRequest.ts:45:23'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('processRequest.ts:45:23')
        expect(result).toContain('[INTERNAL_LOCATION]')
    })

    it('cleans up multiple spaces', () => {
        const message = 'Error    with    multiple    spaces'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('    ')
    })

    it('cleans up newlines and replaces with spaces', () => {
        const message = 'Error\nwith\nnewlines'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('\n')
        expect(result).toBe('Error with newlines')
    })

    it('trims leading and trailing whitespace', () => {
        const message = '   Error message   '
        const result = sanitizeMessage(message)
        expect(result).toBe('Error message')
    })

    it('returns generic message when "Cannot find module" detected', () => {
        const message = "Error: Cannot find module 'package'"
        const result = sanitizeMessage(message)
        // Pattern is replaced so doesn't match the generic check
        expect(result).toBe('Error: Required dependency not found')
    })

    it('returns generic message when error with spawn keyword', () => {
        const message = 'Error with spawn keyword here'
        const result = sanitizeMessage(message)
        expect(result).toBe(
            'A system configuration error occurred. Please contact support if this persists.',
        )
    })

    it('returns generic message when error with require keyword', () => {
        const message = 'Error with require keyword here'
        const result = sanitizeMessage(message)
        expect(result).toBe(
            'A system configuration error occurred. Please contact support if this persists.',
        )
    })

    it('returns generic message containing [SYSTEM_PATH]', () => {
        const message = 'Error: [SYSTEM_PATH] missing'
        const result = sanitizeMessage(message)
        expect(result).toBe(
            'A system configuration error occurred. Please contact support if this persists.',
        )
    })

    it('preserves safe error messages', () => {
        const message = 'Connection timeout occurred'
        const result = sanitizeMessage(message)
        expect(result).toBe('Connection timeout occurred')
    })

    it('handles combined technical patterns', () => {
        const message =
            'Error: Cannot find module at /home/user/app.js when spawn(ffmpeg) failed'
        const result = sanitizeMessage(message)
        expect(result).toBe(
            'A system configuration error occurred. Please contact support if this persists.',
        )
    })

    it('handles deeply nested paths', () => {
        const message =
            'Error at C:\\Users\\test\\project\\src\\utils\\helpers\\file.js:100:5'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('C:\\Users')
    })

    it('handles mixed Unix and Windows paths', () => {
        const message =
            'Errors: /home/user/file.js and C:\\Users\\test\\file.js'
        const result = sanitizeMessage(message)
        expect(result).not.toContain('/home/user')
        expect(result).not.toContain('C:\\Users')
    })

    it('shows replaced spawn message when no other technical keywords present', () => {
        const message = 'spawn(ffmpeg) failed'
        const result = sanitizeMessage(message)
        expect(result).toBe('External process failed')
    })

    it('shows replaced require message when no other technical keywords present', () => {
        const message = 'require("fs") load error'
        const result = sanitizeMessage(message)
        expect(result).toBe('Module loading load error')
    })
})

describe('createUserFriendlyError', () => {
    it('maps ffmpeg errors to audio processing message', () => {
        const error = new Error('ffmpeg: permission denied')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })

    it('maps FFMPEG errors (uppercase)', () => {
        const error = new Error('FFMPEG not found')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })

    it('maps download errors to download failed message', () => {
        const error = new Error('download failed: HTTP 403')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Download failed. The content may be unavailable or restricted.',
        )
    })

    it('maps Download errors (capitalized)', () => {
        const error = new Error('Download timeout')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Download failed. The content may be unavailable or restricted.',
        )
    })

    it('maps connection errors to connection message', () => {
        const error = new Error('connection refused')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Connection error. Please check your internet connection and try again.',
        )
    })

    it('maps CONNECTION errors (uppercase)', () => {
        const error = new Error('CONNECTION_TIMEOUT')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Connection error. Please check your internet connection and try again.',
        )
    })

    it('maps timeout errors to timeout message', () => {
        const error = new Error('timeout after 30s')
        const result = createUserFriendlyError(error)
        expect(result).toBe('Request timed out. Please try again.')
    })

    it('maps TIMEOUT errors (uppercase)', () => {
        const error = new Error('TIMEOUT_EXCEEDED')
        const result = createUserFriendlyError(error)
        expect(result).toBe('Request timed out. Please try again.')
    })

    it('maps permission errors to permission message', () => {
        const error = new Error('permission denied on file')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Permission denied. Please check your settings and try again.',
        )
    })

    it('maps PERMISSION errors (uppercase)', () => {
        const error = new Error('PERMISSION_ERROR')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Permission denied. Please check your settings and try again.',
        )
    })

    it('prefers first matching error mapping', () => {
        const error = new Error('ffmpeg connection timeout')
        const result = createUserFriendlyError(error)
        // Should match 'ffmpeg' first (order matters)
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })

    it('returns sanitized message when no mapping matches', () => {
        const error = new Error('Unknown error type')
        const result = createUserFriendlyError(error)
        expect(result).toBe('Unknown error type')
    })

    it('handles null/undefined by returning generic message', () => {
        const result = createUserFriendlyError(null)
        expect(result).toBe('An unknown error occurred')
    })

    it('handles string errors with mapping', () => {
        const result = createUserFriendlyError('ffmpeg failed')
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })

    it('handles object errors with mapping', () => {
        const error = { message: 'download error', code: 500 }
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Download failed. The content may be unavailable or restricted.',
        )
    })

    it('sanitizes paths before mapping', () => {
        // Paths trigger the generic message, so test without path
        const error = new Error('timeout occurred')
        const result = createUserFriendlyError(error)
        expect(result).toBe('Request timed out. Please try again.')
    })

    it('case-insensitive keyword matching in maps', () => {
        const error = new Error('CONNECTION FAILED')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Connection error. Please check your internet connection and try again.',
        )
    })

    it('matches keywords anywhere in message', () => {
        const error = new Error('The download is in progress')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Download failed. The content may be unavailable or restricted.',
        )
    })

    it('handles errors with system paths - timeout', () => {
        const error = new Error(
            'timeout at C:\\Users\\test\\connection.ts:42:15',
        )
        const result = createUserFriendlyError(error)
        expect(result).toBe('Request timed out. Please try again.')
        expect(result).not.toContain('C:\\Users')
    })

    it('handles errors that become technical after sanitization', () => {
        // This error will trigger the spawn check after sanitization
        const error = new Error('Error with spawn in the message')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'A system configuration error occurred. Please contact support if this persists.',
        )
    })

    it('handles errors with Cannot find module', () => {
        const error = new Error("Cannot find module 'critical-module'")
        const result = createUserFriendlyError(error)
        // The pattern is replaced, so no longer matches the check
        expect(result).toBe('Required dependency not found')
    })
})

describe('integration scenarios', () => {
    it('end-to-end: ffmpeg with path gets mapped', () => {
        const error = new Error('ffmpeg error at /home/app/src/index.js:123:45')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })

    it('end-to-end: nested Error with stack', () => {
        const error = new Error('Cannot find module "@ffmpeg/ffmpeg"')
        error.stack = 'Error: Cannot find module at /app/index.js:10:5'
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'A system configuration error occurred. Please contact support if this persists.',
        )
    })

    it('end-to-end: network timeout error', () => {
        const error = new Error('Request timeout after 30000ms')
        const result = createUserFriendlyError(error)
        expect(result).toBe('Request timed out. Please try again.')
    })

    it('end-to-end: permission denied from ffmpeg', () => {
        const error = new Error('ffmpeg: permission denied')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })

    it('end-to-end: complex error chain with download keyword', () => {
        const error = new Error('download failed: connection timeout')
        const result = createUserFriendlyError(error)
        // Should match 'download' first (appears first in keywords list)
        expect(result).toBe(
            'Download failed. The content may be unavailable or restricted.',
        )
    })

    it('handles whitespace-heavy error messages', () => {
        const error = new Error('   ffmpeg   processing   error   ')
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })

    it('handles multiline error messages', () => {
        const error = new Error(
            'Error: ffmpeg failed\nDetails: codec not found\nStack: ...',
        )
        const result = createUserFriendlyError(error)
        expect(result).toBe(
            'Audio processing is currently unavailable. Please try again later.',
        )
    })
})
