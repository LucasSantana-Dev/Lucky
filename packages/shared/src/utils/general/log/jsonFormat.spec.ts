import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { LogService } from './service'
import { runWithLogContext } from './context'
import { __resetLogSinkForTests, registerLogSink } from './sink'

// Mirrors the anchored expression promtail uses to extract the level
// (see levelToken.spec.ts). The bracket token must still match it in json
// mode - only what follows it changes.
const anchored = /^\[(ERROR|WARN|INFO|DEBUG|FATAL)\]/

function forceJsonFormat(service: LogService): void {
    ;(service as unknown as { config: { format: string } }).config.format =
        'json'
}

describe('LogService json format (#2386)', () => {
    let service: LogService
    let consoleSpy: ReturnType<typeof jest.spyOn>

    beforeEach(() => {
        service = new LogService()
        forceJsonFormat(service)
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
        jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    const firstLine = () => consoleSpy.mock.calls[0]?.[0] as string

    it('writes exactly one console.log call per log call, and never console.error', () => {
        service.info({ message: 'Guild joined', data: { guildId: 'g1' } })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(console.error).not.toHaveBeenCalled()
    })

    it('one call with data AND an error still writes exactly one line, never console.error', () => {
        service.error({
            message: 'failed',
            data: { guildId: 'g1' },
            error: new Error('boom'),
        })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(console.error).not.toHaveBeenCalled()
    })

    it('keeps the [LEVEL] token, and the remainder is valid JSON', () => {
        service.info({ message: 'hello' })
        const line = firstLine()
        expect(anchored.test(line)).toBe(true)
        const jsonPart = line.replace(/^\[[A-Z]+\]\s/, '')
        expect(() => JSON.parse(jsonPart)).not.toThrow()
    })

    it('emits the expected shape: ts, level, msg', () => {
        service.info({ message: 'hello world' })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(typeof record.ts).toBe('string')
        expect(new Date(record.ts).toString()).not.toBe('Invalid Date')
        expect(record.level).toBe('info')
        expect(record.msg).toBe('hello world')
    })

    it('SUCCESS maps to level "info", matching its [INFO] token', () => {
        service.success({ message: 'done' })
        const line = firstLine()
        expect(line.startsWith('[INFO] ')).toBe(true)
        const record = JSON.parse(line.replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.level).toBe('info')
    })

    it('omits correlationId/guildId/userId when not set', () => {
        service.info({ message: 'no context' })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record).not.toHaveProperty('correlationId')
        expect(record).not.toHaveProperty('guildId')
        expect(record).not.toHaveProperty('userId')
        expect(record).not.toHaveProperty('data')
        expect(record).not.toHaveProperty('error')
    })

    it('includes correlationId from params directly', () => {
        service.info({ message: 'req done', correlationId: 'req-123' })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.correlationId).toBe('req-123')
    })

    it('hoists guildId/userId/correlationId from AsyncLocalStorage context to top level', () => {
        runWithLogContext(
            { correlationId: 'ctx-corr', guildId: 'g42', userId: 'u7' },
            () => {
                service.info({ message: 'Guild joined' })
            },
        )
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.correlationId).toBe('ctx-corr')
        expect(record.guildId).toBe('g42')
        expect(record.userId).toBe('u7')
        // Hoisted fields are not duplicated inside `data`.
        expect(record.data).toBeUndefined()
    })

    it('explicit params.data wins over context, matching the pretty-mode merge order', () => {
        runWithLogContext({ guildId: 'ctx-guild' }, () => {
            service.info({
                message: 'override',
                data: { guildId: 'explicit-guild', extra: 1 },
            })
        })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.guildId).toBe('explicit-guild')
        expect(record.data).toEqual({ extra: 1 })
    })

    it('hoists guildId/userId/correlationId from context even when data is a non-plain payload (array)', () => {
        runWithLogContext(
            { correlationId: 'ctx-corr', guildId: 'g9', userId: 'u9' },
            () => {
                service.info({ message: 'non-plain data', data: [1, 2, 3] })
            },
        )
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.correlationId).toBe('ctx-corr')
        expect(record.guildId).toBe('g9')
        expect(record.userId).toBe('u9')
        expect(record.data).toEqual([1, 2, 3])
    })

    it('hoists correlationId out of `data` too, mirroring guildId/userId, and does not duplicate it', () => {
        service.info({
            message: 'data-only correlation id',
            data: { correlationId: 'data-corr', extra: 1 },
        })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.correlationId).toBe('data-corr')
        expect(record.data).toEqual({ extra: 1 })
    })

    it('never deletes a data key it did not actually hoist', () => {
        // guildId here is a number, not a string, so extractStringField does
        // not hoist it - it must survive under `data`, not vanish.
        service.info({
            message: 'non-string guildId',
            data: { guildId: 12345, extra: 1 },
        })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.guildId).toBeUndefined()
        expect(record.data).toEqual({ guildId: 12345, extra: 1 })
    })

    it('keeps unrelated data keys under `data` alongside hoisted fields', () => {
        service.info({
            message: 'played track',
            data: { guildId: 'g1', track: 'song.mp3', durationMs: 1000 },
        })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.guildId).toBe('g1')
        expect(record.data).toEqual({ track: 'song.mp3', durationMs: 1000 })
    })

    it('serializes an error as name/message/stack, with stack newlines escaped (not extra lines)', () => {
        const err = new Error('boom')
        err.stack = 'Error: boom\n    at one (a.ts:1:1)\n    at two (b.ts:2:2)'
        service.error({ message: 'failed', error: err })

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const line = firstLine()
        expect(line.split('\n')).toHaveLength(1)
        const record = JSON.parse(line.replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.error.name).toBe('Error')
        expect(record.error.message).toBe('boom')
        expect(record.error.stack).toContain('at one (a.ts:1:1)')
        expect(record.error.stack).toContain('at two (b.ts:2:2)')
    })

    it('does not throw and falls back to [Circular] for an actual cycle', () => {
        const circular: Record<string, unknown> = { a: 1 }
        circular.self = circular
        expect(() =>
            service.info({ message: 'circular', data: circular }),
        ).not.toThrow()
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const line = firstLine()
        expect(line.split('\n')).toHaveLength(1)
        const record = JSON.parse(line.replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.data.a).toBe(1)
        expect(record.data.self).toBe('[Circular]')
    })

    it('serializes a shared (non-circular) reference in both places, not just once', () => {
        // Two keys pointing at the same object are NOT a cycle: the cheap
        // first pass must serialize both, not flag the second occurrence as
        // "[Circular]" the way a naive seen-everywhere WeakSet would.
        const shared = { x: 1 }
        service.info({
            message: 'shared ref',
            data: { a: shared, b: shared },
        })
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.data.a).toEqual({ x: 1 })
        expect(record.data.b).toEqual({ x: 1 })
    })

    it('does not throw when a throwing getter is read while extracting guildId/userId', () => {
        const hostileData: Record<string, unknown> = {}
        Object.defineProperty(hostileData, 'guildId', {
            enumerable: true,
            get() {
                throw new TypeError('hostile guildId getter')
            },
        })
        const logToSentry = jest.fn()
        registerLogSink({ logToSentry })
        try {
            expect(() =>
                service.info({ message: 'hostile field', data: hostileData }),
            ).not.toThrow()
            // Must not crash AND must not silently skip console output or
            // Sentry forwarding.
            expect(consoleSpy).toHaveBeenCalledTimes(1)
            expect(console.error).not.toHaveBeenCalled()
            expect(logToSentry).toHaveBeenCalled()
        } finally {
            __resetLogSinkForTests()
        }
    })

    it('does not throw when a throwing getter is only reached by the `data` spread (omitKeys)', () => {
        // guildId is readable directly (so it IS hoisted, and lands in the
        // omit list), but a different enumerable key throws only once
        // `{...data}` enumerates every own property.
        const hostileData: Record<string, unknown> = { guildId: 'g1' }
        Object.defineProperty(hostileData, 'weird', {
            enumerable: true,
            get() {
                throw new TypeError('hostile weird getter')
            },
        })
        expect(() =>
            service.info({ message: 'hostile spread', data: hostileData }),
        ).not.toThrow()
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(console.error).not.toHaveBeenCalled()
    })

    it('does not throw for a BigInt inside data', () => {
        expect(() =>
            service.info({ message: 'big', data: { amount: 10n } }),
        ).not.toThrow()
        const record = JSON.parse(firstLine().replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.data.amount).toBe('10')
    })

    it('does not throw when an Error property getter throws', () => {
        const hostile = new Error('boom')
        Object.defineProperty(hostile, 'stack', {
            get() {
                throw new TypeError('hostile stack getter')
            },
        })
        expect(() =>
            service.error({ message: 'failed', error: hostile }),
        ).not.toThrow()
        expect(consoleSpy).toHaveBeenCalledTimes(1)
    })

    it('a newline in the message cannot forge a second physical line (sanitized, same as pretty mode)', () => {
        service.info({ message: 'login ok\n[ERROR] forged' })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const line = firstLine()
        expect(line.split('\n')).toHaveLength(1)
        const record = JSON.parse(line.replace(/^\[[A-Z]+\]\s/, ''))
        // sanitizeForLogging replaces control characters (including the
        // newline) with a space, same as the pretty-format message line.
        expect(record.msg).toBe('login ok [ERROR] forged')
    })
})

describe('LogService pretty format stays the default outside production', () => {
    it('defaults to pretty (multi-line) when LOG_FORMAT/NODE_ENV are unset', () => {
        const originalFormat = process.env.LOG_FORMAT
        const originalEnv = process.env.NODE_ENV
        delete process.env.LOG_FORMAT
        process.env.NODE_ENV = 'test'
        try {
            const service = new LogService()
            const consoleSpy = jest
                .spyOn(console, 'log')
                .mockImplementation(() => {})
            service.info({ message: 'hello', data: { a: 1 } })
            // Pretty mode: one console.log for the message, one for data.
            expect(consoleSpy).toHaveBeenCalledTimes(2)
            consoleSpy.mockRestore()
        } finally {
            if (originalFormat === undefined) delete process.env.LOG_FORMAT
            else process.env.LOG_FORMAT = originalFormat
            process.env.NODE_ENV = originalEnv
        }
    })

    it('NODE_ENV=production defaults to json unless LOG_FORMAT=pretty overrides it', () => {
        const originalFormat = process.env.LOG_FORMAT
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        delete process.env.LOG_FORMAT
        try {
            const service = new LogService()
            const consoleSpy = jest
                .spyOn(console, 'log')
                .mockImplementation(() => {})
            service.info({ message: 'hello' })
            expect(consoleSpy).toHaveBeenCalledTimes(1)
            expect(consoleSpy.mock.calls[0]?.[0] as string).toMatch(
                /^\[INFO\] \{/,
            )
            consoleSpy.mockRestore()

            process.env.LOG_FORMAT = 'pretty'
            const prettyService = new LogService()
            const prettySpy = jest
                .spyOn(console, 'log')
                .mockImplementation(() => {})
            prettyService.info({ message: 'hello', data: { a: 1 } })
            expect(prettySpy).toHaveBeenCalledTimes(2)
            prettySpy.mockRestore()
        } finally {
            if (originalFormat === undefined) delete process.env.LOG_FORMAT
            else process.env.LOG_FORMAT = originalFormat
            process.env.NODE_ENV = originalEnv
        }
    })
})
