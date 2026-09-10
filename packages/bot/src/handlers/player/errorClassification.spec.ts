import { describe, expect, it, jest } from '@jest/globals'
import {
    toErrorDetails,
    toErrorInstance,
    normalizeText,
    isSameTrack,
    safeErrorLog,
    runSafely,
    runSafelyAsync,
} from './errorClassification'

const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    sanitizeErrorMessage: (e: unknown) =>
        e instanceof Error ? e.message : String(e),
    sanitizeStack: (e: unknown) => (e instanceof Error ? e.stack : undefined),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../utils/music/searchQueryCleaner', () => ({
    cleanTitle: (title: string) => title,
}))

describe('errorClassification', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('toErrorDetails', () => {
        it('extracts message, stack, and name from Error instances', () => {
            const error = new TypeError('Something went wrong')
            const result = toErrorDetails(error)

            expect(result.errorMessage).toBe('Something went wrong')
            expect(result.errorName).toBe('TypeError')
            expect(result.errorStack).toBeDefined()
        })

        it('coerces non-Error values to string', () => {
            const result = toErrorDetails('raw string error')

            expect(result.errorMessage).toBe('raw string error')
            expect(result.errorName).toBe('string')
            expect(result.errorStack).toBeUndefined()
        })

        it('handles null and undefined gracefully', () => {
            const resultNull = toErrorDetails(null)
            expect(resultNull.errorMessage).toBe('null')

            const resultUndefined = toErrorDetails(undefined)
            expect(resultUndefined.errorMessage).toBe('undefined')
        })
    })

    describe('toErrorInstance', () => {
        it('returns the Error if error is an instance of Error', () => {
            const error = new Error('test')
            expect(toErrorInstance(error)).toBe(error)
        })

        it('returns undefined for non-Error values', () => {
            expect(toErrorInstance('string')).toBeUndefined()
            expect(toErrorInstance(123)).toBeUndefined()
            expect(toErrorInstance(null)).toBeUndefined()
        })
    })

    describe('normalizeText', () => {
        it('converts to lowercase, removes non-alphanumeric, and trims', () => {
            expect(normalizeText('HeLLo WoRLD!')).toBe('helloworld')
            expect(normalizeText('123-456')).toBe('123456')
            expect(normalizeText('  spaced  ')).toBe('spaced')
        })

        it('returns empty string for undefined or empty input', () => {
            expect(normalizeText()).toBe('')
            expect(normalizeText('')).toBe('')
            expect(normalizeText('   ')).toBe('')
        })
    })

    describe('isSameTrack', () => {
        it('returns true when URLs match exactly', () => {
            const track1 = { url: 'https://example.com/track' }
            const track2 = { url: 'https://example.com/track' }

            expect(isSameTrack(track1, track2)).toBe(true)
        })

        it('returns false when URLs differ', () => {
            const track1 = { url: 'https://example.com/track1' }
            const track2 = { url: 'https://example.com/track2' }

            expect(isSameTrack(track1, track2)).toBe(false)
        })

        it('falls back to normalized title comparison when URLs are missing', () => {
            const track1 = { title: 'Song A' }
            const track2 = { title: 'Song A' }

            expect(isSameTrack(track1, track2)).toBe(true)
        })

        it('returns false when normalized titles differ', () => {
            const track1 = { title: 'Song A' }
            const track2 = { title: 'Song B' }

            expect(isSameTrack(track1, track2)).toBe(false)
        })

        it('returns false when normalized title is 3 chars or less', () => {
            const track1 = { title: 'foo' }
            const track2 = { title: 'foo' }

            expect(isSameTrack(track1, track2)).toBe(false)
        })
    })

    describe('safeErrorLog', () => {
        it('calls errorLog with the provided payload', () => {
            const payload = {
                message: 'test error',
                error: new Error('details'),
                data: { context: 'test' },
            }

            safeErrorLog(payload)

            expect(errorLogMock).toHaveBeenCalledWith(payload)
        })

        it('falls back to console.error when errorLog throws', () => {
            const consoleErrorSpy = jest
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            errorLogMock.mockImplementationOnce(() => {
                throw new Error('logger transport failed')
            })

            const payload = {
                message: 'test',
                error: new Error('original'),
                data: { info: 'test' },
            }

            safeErrorLog(payload)

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                payload.message,
                payload.error,
                payload.data,
                expect.any(Error),
            )

            consoleErrorSpy.mockRestore()
        })
    })

    describe('runSafely', () => {
        it('executes the function without throwing', () => {
            const mockFn = jest.fn()

            expect(() => {
                runSafely('operation', mockFn)
            }).not.toThrow()

            expect(mockFn).toHaveBeenCalled()
        })

        it('logs failures and does not rethrow', () => {
            const error = new Error('operation failed')
            const mockFn = jest.fn(() => {
                throw error
            })

            expect(() => {
                runSafely('failed operation', mockFn)
            }).not.toThrow()

            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('runSafelyAsync', () => {
        it('executes the async function without throwing', async () => {
            const mockFn = jest.fn().mockResolvedValue(undefined)

            await expect(
                runSafelyAsync('async operation', mockFn),
            ).resolves.toBeUndefined()

            expect(mockFn).toHaveBeenCalled()
        })

        it('logs failures and does not rethrow', async () => {
            const error = new Error('async operation failed')
            const mockFn = jest.fn().mockRejectedValue(error)

            await expect(
                runSafelyAsync('failed async operation', mockFn),
            ).resolves.toBeUndefined()

            expect(errorLogMock).toHaveBeenCalled()
        })
    })
})
