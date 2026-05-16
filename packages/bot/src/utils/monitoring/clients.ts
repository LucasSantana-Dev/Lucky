/**
 * Singleton client instances for the simplified telemetry system.
 *
 * Extracted from `./SimplifiedTelemetry` to break the runtime cycles
 * `SimplifiedTelemetry ↔ healthChecks` and `SimplifiedTelemetry ↔
 * telemetryMetrics` (madge cycles 3, 4 of the original list). See
 * docs/decisions/2026-05-16-next-refactor-target-bot-circular-deps.md.
 *
 * Interfaces live in `./telemetryTypes` so this module has no
 * dependency on `./SimplifiedTelemetry`.
 */

import { infoLog, errorLog, debugLog } from '@lucky/shared/utils'
import type {
    TelemetrySpan,
    TelemetryTracer,
    MetricsClient,
    HealthCheckClient,
} from './telemetryTypes'

class SimplifiedSpan implements TelemetrySpan {
    private readonly name: string
    private readonly startTime: number
    private attributes: Record<string, string> = {}
    private status: { code: number; message?: string } = { code: 1 }
    private ended = false

    constructor(name: string) {
        this.name = name
        this.startTime = Date.now()
        debugLog({ message: `Started span: ${name}` })
    }

    setAttributes(attrs: Record<string, string>): void {
        this.attributes = { ...this.attributes, ...attrs }
    }

    setAttribute(key: string, value: string): void {
        this.attributes[key] = value
    }

    setStatus(status: { code: number; message?: string }): void {
        this.status = status
    }

    end(): void {
        if (this.ended) return

        const duration = Date.now() - this.startTime
        this.ended = true

        debugLog({
            message: `Ended span: ${this.name}`,
            data: {
                duration,
                status: this.status.code,
                attributes: this.attributes,
            },
        })
    }

    recordException(error: Error): void {
        errorLog({
            message: `Exception in span: ${this.name}`,
            error,
            data: this.attributes,
        })
        this.setStatus({ code: 2, message: error.message })
    }
}

class SimplifiedTracer implements TelemetryTracer {
    startSpan(name: string): TelemetrySpan {
        return new SimplifiedSpan(name)
    }
}

class SimplifiedMetricsClient implements MetricsClient {
    commandExecutions = {
        inc: (labels: Record<string, string>) => {
            infoLog({ message: 'Command execution', data: labels })
        },
    }

    commandDuration = {
        observe: (labels: Record<string, string>, value: number) => {
            debugLog({
                message: 'Command duration',
                data: { ...labels, duration: value },
            })
        },
    }

    interactions = {
        inc: (labels: Record<string, string>) => {
            infoLog({ message: 'Interaction', data: labels })
        },
    }

    musicActions = {
        inc: (labels: Record<string, string>) => {
            infoLog({ message: 'Music action', data: labels })
        },
    }

    errors = {
        inc: (labels: Record<string, string>) => {
            errorLog({ message: 'Error metric', data: labels })
        },
    }
}

class SimplifiedHealthCheckClient implements HealthCheckClient {
    isHealthy(): boolean {
        return true
    }
}

export const simplifiedTracer: TelemetryTracer = new SimplifiedTracer()
export const simplifiedMetrics: MetricsClient = new SimplifiedMetricsClient()
export const simplifiedHealthCheck: HealthCheckClient =
    new SimplifiedHealthCheckClient()
