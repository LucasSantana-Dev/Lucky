import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { LogService } from './service'
import { runWithLogContext } from './context'

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

    it('writes exactly one console.log call per log call', () => {
        service.info({ message: 'Guild joined', data: { guildId: 'g1' } })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
    })

    it('one call with data AND an error still writes exactly one line', () => {
        service.error({
            message: 'failed',
            data: { guildId: 'g1' },
            error: new Error('boom'),
        })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
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

    it('does not throw and stays on one line for a circular data value', () => {
        const circular: Record<string, unknown> = {}
        circular.self = circular
        expect(() =>
            service.info({ message: 'circular', data: circular }),
        ).not.toThrow()
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        expect(firstLine().split('\n')).toHaveLength(1)
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

    it('a newline in the message cannot forge a second physical line (escaped by JSON, not stripped)', () => {
        service.info({ message: 'login ok\n[ERROR] forged' })
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const line = firstLine()
        expect(line.split('\n')).toHaveLength(1)
        const record = JSON.parse(line.replace(/^\[[A-Z]+\]\s/, ''))
        expect(record.msg).toBe('login ok\n[ERROR] forged')
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
