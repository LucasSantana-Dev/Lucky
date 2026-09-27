import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { telemetryLog } from './index'
import { runWithLogContext, getLogContext } from './context'

describe('telemetryLog', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('emits the given event and fields, never the ambient userId/correlationId', () => {
        const consoleSpy = jest
            .spyOn(console, 'log')
            .mockImplementation(() => {})

        runWithLogContext(
            {
                correlationId: 'ctx-corr',
                guildId: 'ambient-guild',
                userId: 'discord-user-999',
            },
            () => {
                telemetryLog('command_executed', {
                    guildId: 'g1',
                    command: 'play',
                })
            },
        )

        const output = consoleSpy.mock.calls
            .map((call) => call.join(' '))
            .join('\n')
        expect(output).not.toContain('discord-user-999')
        expect(output).not.toContain('ctx-corr')
        expect(output).not.toContain('ambient-guild')
        expect(output).toContain('command_executed')
        expect(output).toContain('g1')
        expect(output).toContain('play')
    })

    it('never adds a userId field, even when the caller omits every field', () => {
        const consoleSpy = jest
            .spyOn(console, 'log')
            .mockImplementation(() => {})

        runWithLogContext({ userId: 'discord-user-1' }, () => {
            telemetryLog('dashboard_login')
        })

        const output = consoleSpy.mock.calls
            .map((call) => call.join(' '))
            .join('\n')
        expect(output).not.toContain('discord-user-1')
        expect(output).not.toContain('userId')
        expect(output).toContain('dashboard_login')
    })

    it('strips an explicit userId/correlationId field instead of letting them get hoisted and logged', () => {
        const consoleSpy = jest
            .spyOn(console, 'log')
            .mockImplementation(() => {})

        // No ambient context at all here — this call site itself is the
        // one (accidentally) passing identity fields as `fields`.
        telemetryLog('command_executed', {
            guildId: 'g1',
            command: 'play',
            userId: 'explicit-user-id',
            correlationId: 'explicit-correlation-id',
        })

        const output = consoleSpy.mock.calls
            .map((call) => call.join(' '))
            .join('\n')
        expect(output).not.toContain('explicit-user-id')
        expect(output).not.toContain('explicit-correlation-id')
        expect(output).not.toContain('userId')
        expect(output).not.toContain('correlationId')
        expect(output).toContain('g1')
        expect(output).toContain('play')
    })

    it('restores the outer context after logging (does not leak the reset)', () => {
        jest.spyOn(console, 'log').mockImplementation(() => {})

        runWithLogContext({ guildId: 'outer-guild' }, () => {
            telemetryLog('command_executed', { guildId: 'g1', command: 'x' })
            expect(getLogContext()?.guildId).toBe('outer-guild')
        })
    })
})
