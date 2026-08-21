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

import { LogService } from './service'
import { LogLevel } from './types'

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
        ['error', LogLevel.ERROR, 'ERROR'],
        ['warn', LogLevel.WARN, 'WARN'],
        ['info', LogLevel.INFO, 'INFO'],
        ['debug', LogLevel.DEBUG, 'DEBUG'],
    ])('%s emits [%s] at index 0', (method, _level, token) => {
        ;(service as unknown as Record<string, (p: unknown) => void>)[method]({
            message: 'hello',
        })
        expect(firstLine().startsWith(`[${token}] `)).toBe(true)
        expect(anchored.test(firstLine())).toBe(true)
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
        expect(firstLine()).toBe('[WARN] no prefixes')
    })

    it('keeps the token at index 0 when a correlationId is present', () => {
        service.warn({ message: 'with correlation', correlationId: 'req-abc' })
        expect(firstLine().startsWith('[WARN] ')).toBe(true)
        expect(firstLine()).toContain('req-abc')
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
