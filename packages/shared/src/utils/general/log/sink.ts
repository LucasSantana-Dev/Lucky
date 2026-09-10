/**
 * Registration seam for alerting/monitoring, so `log` never imports upward
 * into `utils/alerts` or `utils/monitoring` (that used to form 3 import
 * cycles — see #2331). Those modules register their callbacks here at
 * module load instead of `log` importing them directly. `log` stays a leaf:
 * a consumer that only wants console output never pulls in Sentry or the
 * alert webhook.
 */

export type LogAlertPayload = {
    title: string
    description: string
    color?: 'danger' | 'warning' | 'info'
}

export type SentrySeverity =
    'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'

export type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal'

export type LogSyncLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogSink = {
    captureException?: (error: Error, extras?: Record<string, unknown>) => void
    captureMessage?: (
        message: string,
        level?: SentrySeverity,
        extras?: Record<string, unknown>,
    ) => void
    addBreadcrumb?: (
        message: string,
        category?: string,
        level?: BreadcrumbLevel,
        data?: Record<string, unknown>,
    ) => void
    logToSentry?: (
        level: LogSyncLevel,
        message: string,
        attributes?: Record<string, unknown>,
    ) => void
    recordWithCooldown?: (
        key: string,
        windowMs: number,
        threshold: number,
        cooldownMs: number,
    ) => boolean
    emitAlert?: (payload: LogAlertPayload) => void
}

let sink: LogSink = {}

/** Merges the given callbacks into the registered sink. */
export function registerLogSink(partial: LogSink): void {
    sink = { ...sink, ...partial }
}

export function getLogSink(): LogSink {
    return sink
}

/** Test-only: clears every registered callback. */
export function __resetLogSinkForTests(): void {
    sink = {}
}
