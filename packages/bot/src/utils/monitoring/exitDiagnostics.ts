import { writeSync } from 'node:fs'
import type { EventEmitter } from 'node:events'

// The bot has exited with code 0 and no log line at all, right after a track
// skip (#3036). The only exit(0) paths log first, so the cause is unknown.
// These lines are written with a synchronous fd write: nothing queued or
// async survives process.exit, so the exit itself must say why it happened.

type ProcessLike = EventEmitter & { pid: number; uptime: () => number }

type Options = {
    proc?: ProcessLike
    write?: (line: string) => void
}

function stderrWrite(line: string): void {
    writeSync(2, line)
}

function formatLine(level: 'INFO' | 'WARN', msg: string, data: object): string {
    return `[${level}] ${JSON.stringify({
        ts: new Date().toISOString(),
        level: level.toLowerCase(),
        msg,
        data,
    })}\n`
}

export function installExitDiagnostics({
    proc = process,
    write = stderrWrite,
}: Options = {}): { noteSignal: (signal: string) => void } {
    let cause = 'unknown'

    const safeWrite = (line: string): void => {
        try {
            write(line)
        } catch {
            // stderr may already be closed; never throw from an exit listener.
        }
    }

    // Fires only when the event loop has nothing left to run, never on
    // process.exit(): a bot that exits 0 this way logs nothing else.
    proc.on('beforeExit', (code: number) => {
        cause = 'event_loop_drained'
        safeWrite(
            formatLine('WARN', 'Event loop drained, process will exit', {
                code,
                pid: proc.pid,
            }),
        )
    })

    proc.on('exit', (code: number) => {
        safeWrite(
            formatLine('INFO', 'Process exiting', {
                code,
                cause,
                pid: proc.pid,
                uptimeSec: proc.uptime(),
            }),
        )
    })

    return {
        noteSignal: (signal: string) => {
            cause = `signal:${signal}`
        },
    }
}
