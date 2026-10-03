import { getPrismaClient, warnLog } from '@lucky/shared/utils'
import { commandEventsDroppedTotal } from './prometheus'

export type CommandEventRow = {
    occurredAt: Date
    guildId: string | null
    userId: string
    command: string
    subcommand: string | null
    kind: string
    outcome: string
    latencyMs: number
    errorClass: string | null
    shardId: number
}

type BufferOptions = {
    flush: (rows: CommandEventRow[]) => Promise<unknown>
    maxSize?: number
    flushSize?: number
    flushIntervalMs?: number
    warnIntervalMs?: number
}

export type CommandEventBuffer = {
    push: (row: CommandEventRow) => void
    flush: () => Promise<void>
    stop: () => Promise<void>
    size: () => number
}

const DEFAULT_MAX_SIZE = 5000
const DEFAULT_FLUSH_SIZE = 100
const DEFAULT_FLUSH_INTERVAL_MS = 10_000
const DEFAULT_WARN_INTERVAL_MS = 60_000

/**
 * Bounded in-memory buffer for command events (#2391). push() is synchronous
 * and never throws or awaits the DB. Rows are lost only on overflow or a
 * failed flush; both increment lucky_bot_command_events_dropped_total{reason}
 * and emit a rate-limited warnLog. No retry loop: a failed batch is dropped.
 */
export function createCommandEventBuffer(
    options: BufferOptions,
): CommandEventBuffer {
    const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE
    const flushSize = options.flushSize ?? DEFAULT_FLUSH_SIZE
    const intervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    const warnIntervalMs = options.warnIntervalMs ?? DEFAULT_WARN_INTERVAL_MS

    let rows: CommandEventRow[] = []
    let timer: ReturnType<typeof setInterval> | null = null
    let inFlight: Promise<void> = Promise.resolve()
    let lastWarnAt = Number.NEGATIVE_INFINITY
    let suppressed = 0

    const warnThrottled = (message: string, data: Record<string, unknown>) => {
        const now = Date.now()
        if (now - lastWarnAt < warnIntervalMs) {
            suppressed++
            return
        }
        lastWarnAt = now
        const extra =
            suppressed > 0 ? { suppressedSinceLastWarn: suppressed } : {}
        suppressed = 0
        warnLog({ message, data: { ...data, ...extra } })
    }

    const doFlush = async (batch: CommandEventRow[]): Promise<void> => {
        try {
            await options.flush(batch)
        } catch (error) {
            commandEventsDroppedTotal.inc(
                { reason: 'flush_failure' },
                batch.length,
            )
            warnThrottled('Command event flush failed, batch dropped', {
                reason: 'flush_failure',
                batchSize: batch.length,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    const flush = (): Promise<void> => {
        if (rows.length === 0) return inFlight
        const batch = rows
        rows = []
        inFlight = inFlight.then(() => doFlush(batch))
        return inFlight
    }

    const ensureTimer = () => {
        if (timer) return
        timer = setInterval(() => {
            void flush()
        }, intervalMs)
        timer.unref()
    }

    return {
        push(row) {
            try {
                if (rows.length >= maxSize) {
                    commandEventsDroppedTotal.inc({ reason: 'overflow' })
                    warnThrottled('Command event buffer full, event dropped', {
                        reason: 'overflow',
                        maxSize,
                    })
                    return
                }
                rows.push(row)
                ensureTimer()
                if (rows.length >= flushSize) void flush()
            } catch {
                // Telemetry must never break the interaction path. Counting
                // is the only safe action left; the counter itself cannot throw.
                commandEventsDroppedTotal.inc({ reason: 'overflow' })
            }
        },
        flush,
        async stop() {
            if (timer) {
                clearInterval(timer)
                timer = null
            }
            await flush()
        },
        size: () => rows.length,
    }
}

let defaultBuffer: CommandEventBuffer | null = null

/** Process-wide buffer persisting through prisma.commandEvent.createMany. */
export function getCommandEventBuffer(): CommandEventBuffer {
    defaultBuffer ??= createCommandEventBuffer({
        flush: (rows) =>
            getPrismaClient().commandEvent.createMany({ data: rows }),
    })
    return defaultBuffer
}

/** Flushes the remaining rows and stops the timer; call from graceful shutdown. */
export async function stopCommandEventBuffer(): Promise<void> {
    if (defaultBuffer) await defaultBuffer.stop()
}
