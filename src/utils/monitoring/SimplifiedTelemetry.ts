/**
 * Simplified telemetry system without OpenTelemetry dependency
 */

import type { ChatInputCommandInteraction, Interaction } from 'discord.js'
import type { CustomClient } from '../../types'
import { infoLog, errorLog, debugLog } from '../general/log'

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
  commandExecutions: { inc: (labels: Record<string, string>) => void }
  commandDuration: { observe: (labels: Record<string, string>, value: number) => void }
  interactions: { inc: (labels: Record<string, string>) => void }
  musicActions: { inc: (labels: Record<string, string>) => void }
  errors: { inc: (labels: Record<string, string>) => void }
}

export interface HealthCheckClient {
  isHealthy: () => boolean
}

// Simplified span implementation
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
        attributes: this.attributes
      }
    })
  }

  recordException(error: Error): void {
    errorLog({
      message: `Exception in span: ${this.name}`,
      error,
      data: this.attributes
    })
    this.setStatus({ code: 2, message: error.message })
  }
}

// Simplified tracer implementation
class SimplifiedTracer implements TelemetryTracer {
  startSpan(name: string): TelemetrySpan {
    return new SimplifiedSpan(name)
  }
}

// Simplified metrics client
class SimplifiedMetricsClient implements MetricsClient {
  commandExecutions = {
    inc: (labels: Record<string, string>) => {
      infoLog({ message: 'Command execution', data: labels })
    }
  }

  commandDuration = {
    observe: (labels: Record<string, string>, value: number) => {
      debugLog({ message: 'Command duration', data: { ...labels, duration: value } })
    }
  }

  interactions = {
    inc: (labels: Record<string, string>) => {
      infoLog({ message: 'Interaction', data: labels })
    }
  }

  musicActions = {
    inc: (labels: Record<string, string>) => {
      infoLog({ message: 'Music action', data: labels })
    }
  }

  errors = {
    inc: (labels: Record<string, string>) => {
      errorLog({ message: 'Error metric', data: labels })
    }
  }
}

// Simplified health check client
class SimplifiedHealthCheckClient implements HealthCheckClient {
  isHealthy(): boolean {
    return true // Simplified - always healthy
  }
}

// Export singleton instances
export const simplifiedTracer = new SimplifiedTracer()
export const simplifiedMetrics = new SimplifiedMetricsClient()
export const simplifiedHealthCheck = new SimplifiedHealthCheckClient()

// Telemetry functions
export function createCommandSpan(
  interaction: ChatInputCommandInteraction,
  _client: CustomClient,
): TelemetrySpan {
  const span = simplifiedTracer.startSpan('command_execution')

  span.setAttributes({
    'command.name': interaction.commandName,
    'command.guild_id': interaction.guildId || 'unknown',
    'command.user_id': interaction.user.id,
    'command.channel_id': interaction.channelId || 'unknown',
  })

  return span
}

export function createInteractionSpan(
  interaction: Interaction,
  _client: CustomClient,
): TelemetrySpan {
  const span = simplifiedTracer.startSpan('interaction_handling')

  span.setAttributes({
    'interaction.type': interaction.type.toString(),
    'interaction.guild_id': interaction.guildId || 'unknown',
    'interaction.user_id': interaction.user.id,
    'interaction.channel_id': interaction.channelId || 'unknown',
  })

  return span
}

export function markSpanSuccess(span: TelemetrySpan): void {
  span.setStatus({ code: 1 }) // OK
  span.end()
}

export function markSpanError(
  span: TelemetrySpan,
  error: Error,
): void {
  span.setStatus({ code: 2, message: error.message }) // ERROR
  span.recordException(error)
  span.end()
}

// Metrics functions
export function recordCommandMetric(
  client: CustomClient,
  commandName: string,
  success: boolean,
  executionTime: number,
): void {
  if (!client.metrics) return

  simplifiedMetrics.commandExecutions.inc({
    command: commandName,
    success: success.toString(),
  })

  simplifiedMetrics.commandDuration.observe({ command: commandName }, executionTime)
}

export function recordInteractionMetric(
  client: CustomClient,
  interactionType: string,
  success: boolean,
): void {
  if (!client.metrics) return

  simplifiedMetrics.interactions.inc({
    type: interactionType,
    success: success.toString(),
  })
}

export function recordMusicMetric(
  client: CustomClient,
  action: string,
  guildId: string,
): void {
  if (!client.metrics) return

  simplifiedMetrics.musicActions.inc({
    action,
    guild_id: guildId,
  })
}

export function recordErrorMetric(
  client: CustomClient,
  errorType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
): void {
  if (!client.metrics) return

  simplifiedMetrics.errors.inc({
    type: errorType,
    severity,
  })
}

// Health check functions
export function checkRedisHealth(_client: CustomClient): boolean {
  if (!_client.redis) return false
  return simplifiedHealthCheck.isHealthy()
}

export function checkDatabaseHealth(_client: CustomClient): boolean {
  // Simplified health check - always return true for now
  return true
}

export function checkMusicHealth(_client: CustomClient): boolean {
  // Simplified health check - always return true for now
  return true
}

export interface HealthCheck {
  service: string
  status: 'healthy' | 'unhealthy'
  lastCheck: Date
  error?: string
}

export interface HealthReport {
  overall: 'healthy' | 'unhealthy'
  services: HealthCheck[]
  timestamp: Date
}

export async function generateHealthReport(
  client: CustomClient,
): Promise<HealthReport> {
  const services: HealthCheck[] = [
    {
      service: 'redis',
      status: checkRedisHealth(client) ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
    },
    {
      service: 'database',
      status: checkDatabaseHealth(client) ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
    },
    {
      service: 'music',
      status: checkMusicHealth(client) ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
    },
  ]

  const overall = services.every(s => s.status === 'healthy') ? 'healthy' : 'unhealthy'

  return {
    overall,
    services,
    timestamp: new Date(),
  }
}
