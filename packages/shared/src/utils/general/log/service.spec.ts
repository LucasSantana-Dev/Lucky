import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LogService } from './service'
import { logToSentry } from '../../monitoring'

jest.mock('../../monitoring', () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
    logToSentry: jest.fn(),
}))

jest.mock('../../alerts', () => ({
    recordWithCooldown: jest.fn().mockReturnValue(false),
    emitAlert: jest.fn().mockImplementation(async () => {}),
}))

jest.mock('./context', () => ({
    getLogContext: jest.fn().mockReturnValue(undefined),
}))

jest.mock('chalk', () => {
    const id = (t: string) => t
    return {
        __esModule: true,
        default: { red: id, yellow: id, blue: id, green: id, gray: id },
    }
})

describe('LogService', () => {
    let service: LogService

    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(console, 'log').mockImplementation(() => {})
        jest.spyOn(console, 'error').mockImplementation(() => {})
        service = new LogService()
    })

    // The ~1160 infoLog/warnLog/debugLog calls only became breadcrumbs, and a breadcrumb
    // only shows up attached to an error event. These tests pin down the log's own exit.
    describe('emission to Sentry', () => {
        it('info becomes an info-level log, with data as attributes', () => {
            service.info({ message: 'playing track', data: { guildId: '42' } })

            expect(logToSentry).toHaveBeenCalledWith(
                'info',
                expect.stringContaining('playing track'),
                expect.objectContaining({ guildId: '42' }),
            )
        })

        it('warn becomes warn and error becomes error', () => {
            service.warn({ message: 'queue full' })
            service.error({ message: 'it failed' })

            expect(logToSentry).toHaveBeenCalledWith(
                'warn',
                expect.stringContaining('queue full'),
                undefined,
            )
            expect(logToSentry).toHaveBeenCalledWith(
                'error',
                expect.stringContaining('it failed'),
                undefined,
            )
        })

        // Counter-proof: without it, enabling logs would ship 340 debugLog calls even
        // with the level switched off in production.
        it('a disabled level does NOT travel: suppressed debug never reaches Sentry', () => {
            service.setLogLevel(0) // ERROR only
            jest.clearAllMocks()

            service.debug({ message: 'debug noise' })

            expect(logToSentry).not.toHaveBeenCalled()
        })

        // Log injection: the same reason the console output is sanitised.
        it('the message goes sanitised, with no newline', () => {
            service.info({ message: 'linha1\nlinha2' })

            const [, message] = (logToSentry as jest.Mock).mock.calls[0] as [
                string,
                string,
                unknown,
            ]
            expect(message).not.toContain('\n')
        })
    })

    describe('setLogLevel', () => {
        it('changes the active log level', () => {
            service.setLogLevel(0)
            // With level=0 (ERROR), debug should be suppressed
            const consoleSpy = jest.spyOn(console, 'log')
            consoleSpy.mockClear()
            service.debug({ message: 'should be hidden' })
            expect(consoleSpy).not.toHaveBeenCalled()
        })
    })

    describe('formatMessage with correlationId', () => {
        it('includes correlationId in the formatted output', () => {
            const consoleSpy = jest.spyOn(console, 'log')
            consoleSpy.mockClear()
            service.info({ message: 'hello', correlationId: 'req-abc-123' })
            const logged = consoleSpy.mock.calls[0]?.[0] as string
            expect(logged).toContain('req-abc-123')
            expect(logged).toContain('hello')
        })
    })

    describe('getColor with enableColors disabled', () => {
        it('returns identity function when colors are off', () => {
            ;(service as any).config.enableColors = false
            const consoleSpy = jest.spyOn(console, 'log')
            consoleSpy.mockClear()
            service.info({ message: 'plain text' })
            const logged = consoleSpy.mock.calls[0]?.[0] as string
            expect(logged).toContain('plain text')
        })
    })

    describe('getColor default case', () => {
        it('returns identity function for an unknown level number', () => {
            ;(service as any).config.level = 99
            const consoleSpy = jest.spyOn(console, 'log')
            consoleSpy.mockClear()
            ;(service as any).log(99 as any, { message: 'unknown level' })
            const logged = consoleSpy.mock.calls[0]?.[0] as string
            expect(logged).toContain('unknown level')
        })
    })

    describe('serializeError catch branch', () => {
        it('falls back to String(err) when JSON.stringify throws on a circular reference', () => {
            const circular: Record<string, unknown> = {}
            circular['self'] = circular
            const consoleSpy = jest.spyOn(console, 'log')
            consoleSpy.mockClear()
            service.warn({ message: 'circular', error: circular })
            expect(consoleSpy).toHaveBeenCalled()
        })
    })

    describe('toError non-string path', () => {
        it('converts a number error to an Error via JSON.stringify', () => {
            const { captureException } = jest.requireMock<{
                captureException: jest.Mock
            }>('../../monitoring')
            service.error({ message: 'num err', error: 42 })
            expect(captureException).toHaveBeenCalledWith(
                expect.objectContaining({ message: '42' }),
                expect.anything(),
            )
        })
    })
})
