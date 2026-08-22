import {
    describe,
    expect,
    it,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'

jest.mock('../../monitoring', () => ({
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
}))

jest.mock('../../alerts', () => ({
    recordWithCooldown: jest.fn(() => false),
    emitAlert: jest.fn(),
}))

import chalk from 'chalk'
import { LogService } from './service'

// cubic flagged that these assertions would break under colour. Rather than
// disabling colour, force it ON: the whole point of the token is that it
// survives chalk, so the tests must run in the hostile configuration.
chalk.level = 3

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

// Mirrors the anchored expression promtail uses to extract the level
// (homelab config/promtail/promtail-config.yaml). If this stops matching,
// the `level` label silently goes empty again — which is the failure #2054
// exists to fix, and it is invisible from inside this repo.
const anchored = /^\[(ERROR|WARN|INFO|DEBUG|FATAL)\]/

describe('log level token', () => {
    let service: LogService
    let consoleSpy: ReturnType<typeof jest.spyOn>

    beforeEach(() => {
        service = new LogService()
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    const firstLine = () => consoleSpy.mock.calls[0]?.[0] as string

    it.each([
        ['error', 'ERROR'],
        ['warn', 'WARN'],
        ['info', 'INFO'],
        ['debug', 'DEBUG'],
    ])('%s emits [%s] at index 0, even with colour on', (method, token) => {
        ;(service as unknown as Record<string, (p: unknown) => void>)[method]({
            message: 'hello',
        })
        expect(firstLine().startsWith(`[${token}] `)).toBe(true)
        expect(anchored.test(firstLine())).toBe(true)
    })

    it('prefixes each stack FRAME, not just the header line', () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const err = new Error('boom')
            err.stack =
                'Error: boom\n    at one (a.ts:1:1)\n    at two (b.ts:2:2)'
            service.error({ message: 'failed', error: err })

            const emitted = errSpy.mock.calls
                .map((c: unknown[]) => stripAnsi(c[0] as string))
                .find((line: string) => line.includes('boom'))
            expect(emitted).toBeDefined()

            const lines = (emitted as string).split('\n')
            // Asserts the FRAMES survive as separate lines, not merely that the
            // output is multi-line. An earlier version asserted length > 1 and
            // passed with 2 lines while both frames sat flattened in the second
            // one, which is the bug this guards.
            expect(lines.some((l) => l.includes('at one (a.ts:1:1)'))).toBe(
                true,
            )
            expect(lines.some((l) => l.includes('at two (b.ts:2:2)'))).toBe(
                true,
            )
            expect(lines.length).toBeGreaterThanOrEqual(3)
            for (const line of lines) {
                expect(anchored.test(line)).toBe(true)
            }
        } finally {
            errSpy.mockRestore()
        }
    })

    it('a newline in the message cannot forge a second log record', () => {
        service.info({
            message: 'login ok\n[ERROR] invalid password for admin',
        })
        const emitted = consoleSpy.mock.calls.map((c: unknown[]) =>
            stripAnsi(c[0] as string),
        )
        const forged = emitted.filter((l: string) =>
            l.includes('invalid password'),
        )
        expect(forged).toHaveLength(1)
        // One physical line: the newline was collapsed, not turned into a
        // second record the shipper would index separately.
        expect(forged[0].split('\n')).toHaveLength(1)
        expect(forged[0].startsWith('[INFO] ')).toBe(true)
    })

    it('a newline in the error message cannot forge a record either', () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const err = new Error('boom\n[ERROR] forged')
            err.stack = 'Error: boom\n[ERROR] forged\n    at one (a.ts:1:1)'
            service.error({ message: 'failed', error: err })

            const emitted = errSpy.mock.calls
                .map((c: unknown[]) => stripAnsi(c[0] as string))
                .find((l: string) => l.includes('boom'))
            expect(emitted).toBeDefined()
            const lines = (emitted as string).split('\n')
            // The frame survives as its own line; the message newline does not
            // add one.
            expect(lines.some((l) => l.includes('at one (a.ts:1:1)'))).toBe(
                true,
            )
            expect(lines.filter((l) => l.includes('forged'))).toHaveLength(1)
            for (const line of lines) expect(anchored.test(line)).toBe(true)
        } finally {
            errSpy.mockRestore()
        }
    })

    it('does not throw when a circular non-Error reaches toError', () => {
        // service.error() calls toError() AFTER logging; its JSON.stringify was
        // the last unguarded one in the file, so a circular value made the call
        // throw once the log line had already been written.
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const circular: Record<string, unknown> = { a: 1 }
            circular.self = circular
            expect(() =>
                service.error({ message: 'circular', error: circular }),
            ).not.toThrow()
        } finally {
            errSpy.mockRestore()
        }
    })

    it('does not throw when an Error property getter throws', () => {
        // An Error can expose a hostile getter for name, message or stack.
        // Reading it outside the try crashed the log call instead of falling
        // back, and `instanceof Error` still passes for such an object.
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const hostile = new Error('boom')
            Object.defineProperty(hostile, 'stack', {
                get() {
                    throw new TypeError('hostile stack getter')
                },
            })
            expect(() =>
                service.error({ message: 'failed', error: hostile }),
            ).not.toThrow()
        } finally {
            errSpy.mockRestore()
        }
    })

    it('does not throw when the error stringifies to undefined', () => {
        // serializeError's non-Error branch had the same gap the data path got
        // fixed for: a truthy non-Error that JSON.stringify turns into
        // undefined would reach prefixLines and .split(undefined).
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
            expect(() =>
                service.error({ message: 'fn', error: () => undefined }),
            ).not.toThrow()
            expect(() =>
                service.error({ message: 'sym', error: Symbol('x') }),
            ).not.toThrow()
        } finally {
            errSpy.mockRestore()
        }
    })

    it('does not throw when String() itself throws on the value', () => {
        // A null-prototype object with no toPrimitive makes String() throw, so
        // the fallback needed its own fallback.
        const hostile = Object.assign(Object.create(null), {
            toJSON: () => undefined,
        })
        expect(() =>
            service.info({ message: 'hostile', data: hostile }),
        ).not.toThrow()
    })

    it('does not throw when data stringifies to undefined', () => {
        // JSON.stringify returns undefined for functions and symbols; those are
        // truthy, so they reach prefixLines, which would .split(undefined).
        expect(() =>
            service.info({ message: 'fn', data: () => undefined }),
        ).not.toThrow()
        expect(() =>
            service.info({ message: 'sym', data: Symbol('x') }),
        ).not.toThrow()
    })

    it('prefixes every line of multi-line data, which JSON.stringify indents', () => {
        // prefixLines splits on \n BEFORE sanitising, so JSON indentation
        // survives as real lines and each one gets the token. Sanitising first
        // (the earlier shape) collapsed them into a single line instead.
        service.info({ message: 'payload', data: { a: 1, b: { c: 2 } } })
        const emitted = consoleSpy.mock.calls
            .map((c: unknown[]) => stripAnsi(c[0] as string))
            .find((line: string) => line.includes('"a"'))
        expect(emitted).toBeDefined()
        const lines = (emitted as string).split('\n')
        expect(lines.length).toBeGreaterThan(1)
        for (const line of lines) {
            expect(anchored.test(line)).toBe(true)
        }
    })

    it('emits no phantom token line when an Error carries no stack', () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const err = new Error('boom')
            err.stack = undefined
            service.error({ message: 'failed', error: err })

            const emitted = errSpy.mock.calls
                .map((c: unknown[]) => stripAnsi(c[0] as string))
                .find((line: string) => line.includes('boom'))
            expect(emitted).toBeDefined()
            // serializeError appends `\n${stack}`; with no stack that trailing
            // segment is empty and would print a bare "[ERROR] ".
            for (const line of (emitted as string).split('\n')) {
                expect(line.trim()).not.toBe('[ERROR]')
            }
        } finally {
            errSpy.mockRestore()
        }
    })

    it('maps SUCCESS to INFO, a bucket promtail understands', () => {
        service.success({ message: 'done' })
        expect(firstLine().startsWith('[INFO] ')).toBe(true)
    })

    it('falls back to INFO for an out-of-range level rather than [undefined]', () => {
        // shouldLog() gates on level <= config.level, so raise the threshold
        // or the line is filtered out before it is ever formatted.
        ;(service as unknown as { config: { level: number } }).config.level = 99
        ;(service as unknown as { log: (l: number, p: unknown) => void }).log(
            99,
            { message: 'unknown level' },
        )
        expect(firstLine()).not.toContain('undefined')
        expect(firstLine().startsWith('[INFO] ')).toBe(true)
    })

    it('keeps the token at index 0 with timestamp and correlationId disabled', () => {
        // The anchor is only safe if its position does not depend on config.
        const cfg = (service as unknown as { config: Record<string, unknown> })
            .config
        cfg.enableTimestamp = false
        cfg.enableCorrelationId = false

        service.warn({ message: 'no prefixes', correlationId: 'req-1' })
        expect(stripAnsi(firstLine())).toBe('[WARN] no prefixes')
        // The token itself must NOT be inside the colour wrapper.
        expect(firstLine().startsWith('[WARN] ')).toBe(true)
    })

    it('keeps the token at index 0 when a correlationId is present', () => {
        service.warn({ message: 'with correlation', correlationId: 'req-abc' })
        expect(firstLine().startsWith('[WARN] ')).toBe(true)
        expect(firstLine()).toContain('req-abc')
    })

    it('keeps the token outside the colour wrapper', () => {
        // chalk wraps whatever it is given. A token inside it makes the line
        // start with an ANSI escape, so an anchored shipper regex never
        // matches and the level label silently goes empty again.
        service.error({ message: 'boom' })

        expect(firstLine().startsWith('[ERROR] ')).toBe(true)
        expect(firstLine()).toContain('\u001b[') // colour really is on
    })

    it('prefixes the data line with the same token', () => {
        service.warn({ message: 'with data', data: { a: 1 } })

        const dataLine = consoleSpy.mock.calls[1]?.[0] as string
        expect(dataLine.startsWith('[WARN] ')).toBe(true)
    })

    it('does not let message content forge a level', () => {
        // The real incident: a track titled "10 BARRE DI TERRORE" contains the
        // substring ERROR, and promtail's unanchored regex labelled routine
        // playback as an error. An anchored token makes content unforgeable.
        service.info({ message: 'Started playing "10 BARRE DI TERRORE"' })
        const line = firstLine()
        expect(line.startsWith('[INFO] ')).toBe(true)
        expect(anchored.exec(line)?.[1]).toBe('INFO')
    })
})
