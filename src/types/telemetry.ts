/**
 * Telemetry and monitoring type definitions
 */

export interface TelemetrySpan {
    setAttributes: (attrs: Record<string, string>) => void
    setAttribute: (key: string, value: string) => void
    setStatus: (status: { code: number; message?: string }) => void
    end: () => void
    recordException: (error: Error) => void
}

export interface TelemetryTracer {
    startSpan: (name: string) => TelemetrySpan
}

export interface MetricsClient {
    commandExecutions: {
        inc: (labels: Record<string, string>) => void
    }
    commandDuration: {
        observe: (labels: Record<string, string>, value: number) => void
    }
    interactions: {
        inc: (labels: Record<string, string>) => void
    }
    musicActions: {
        inc: (labels: Record<string, string>) => void
    }
    errors: {
        inc: (labels: Record<string, string>) => void
    }
}

export interface HealthCheckClient {
    isHealthy: () => boolean
}

export interface RedisClient {
    isHealthy: () => boolean
}
