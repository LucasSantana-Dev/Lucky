import { EventEmitter } from 'node:events'
import { describe, expect, it, jest } from '@jest/globals'
import { installExitDiagnostics } from './exitDiagnostics'

function fakeProcess() {
    const emitter = new EventEmitter() as EventEmitter & {
        pid: number
        uptime: () => number
        exitCode?: number
    }
    emitter.pid = 1
    emitter.uptime = () => 42.5
    return emitter
}

function lastRecord(write: jest.Mock): Record<string, unknown> {
    const line = String(write.mock.calls.at(-1)?.[0])
    expect(line.startsWith('[')).toBe(true)
    return JSON.parse(line.slice(line.indexOf('{')))
}

describe('installExitDiagnostics (#3036)', () => {
    it('writes the exit code synchronously on exit', () => {
        const proc = fakeProcess()
        const write = jest.fn()
        installExitDiagnostics({ proc, write })

        proc.emit('exit', 0)

        expect(write).toHaveBeenCalledTimes(1)
        expect(lastRecord(write)).toMatchObject({
            msg: 'Process exiting',
            data: { code: 0, uptimeSec: 42.5, cause: 'unknown' },
        })
    })

    it('names the signal that started the shutdown', () => {
        const proc = fakeProcess()
        const write = jest.fn()
        const diagnostics = installExitDiagnostics({ proc, write })

        diagnostics.noteSignal('SIGTERM')
        proc.emit('exit', 0)

        expect(lastRecord(write)).toMatchObject({
            data: { code: 0, cause: 'signal:SIGTERM' },
        })
    })

    it('reports an empty event loop, which exits 0 with no other log', () => {
        const proc = fakeProcess()
        const write = jest.fn()
        installExitDiagnostics({ proc, write })

        proc.emit('beforeExit', 0)
        proc.emit('exit', 0)

        expect(write).toHaveBeenCalledTimes(2)
        expect(String(write.mock.calls[0]?.[0])).toContain('Event loop drained')
        expect(lastRecord(write)).toMatchObject({
            data: { cause: 'event_loop_drained' },
        })
    })

    it('never throws from the exit listener', () => {
        const proc = fakeProcess()
        const write = jest.fn(() => {
            throw new Error('EPIPE')
        })
        installExitDiagnostics({ proc, write })

        expect(() => proc.emit('exit', 1)).not.toThrow()
    })
})
