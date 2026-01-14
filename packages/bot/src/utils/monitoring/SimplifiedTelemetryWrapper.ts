/**
 * Simplified telemetry wrapper - replaces complex OpenTelemetry with simple Sentry-based monitoring
 */

import type { ChatInputCommandInteraction, Interaction } from 'discord.js'
import type { CustomClient } from '../../types'
import { getCategoryFromCommandName } from '../command/commandCategory'
import { simplifiedTracer, simplifiedMetrics, simplifiedHealthCheck } from './SimplifiedTelemetry'

// type SpanAttributeValue = string | number | boolean | undefined

export interface TelemetrySpan {
    setAttributes: (attrs: Record<string, string>) => void
    setStatus: (status: { code: number; message?: string }) => void
    end: () => void
    recordException: (error: Error) => void
}

/**
 * Create a span for command execution
 */
export function createCommandSpan(
    interaction: ChatInputCommandInteraction,
    _client: CustomClient,
) {
    const span = simplifiedTracer.startSpan('command_execution')

    span.setAttributes({
        'command.name': interaction.commandName,
        'command.guild_id': interaction.guildId || 'unknown',
        'command.user_id': interaction.user.id,
        'command.channel_id': interaction.channelId || 'unknown',
        'command.category': getCategoryFromCommandName(interaction.commandName),
    })

    return span
}

/**
 * Create a span for interaction handling
 */
export function createInteractionSpan(
    interaction: Interaction,
    _client: CustomClient,
) {
    const span = simplifiedTracer.startSpan('interaction_handling')

    span.setAttributes({
        'interaction.type': interaction.type.toString(),
        'interaction.guild_id': interaction.guildId || 'unknown',
        'interaction.user_id': interaction.user.id,
        'interaction.channel_id': interaction.channelId || 'unknown',
    })

    return span
}

/**
 * Mark span as successful
 */
export function markSpanSuccess(span: TelemetrySpan): void {
    span.setStatus({ code: 1 }) // OK
    span.end()
}

/**
 * Mark span as error
 */
export function markSpanError(
    span: TelemetrySpan,
    error: Error,
): void {
    span.setStatus({ code: 2, message: error.message }) // ERROR
    span.recordException(error)
    span.end()
}

/**
 * Record command execution metrics
 */
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

/**
 * Record interaction metrics
 */
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

/**
 * Record music action metrics
 */
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

/**
 * Record error metrics
 */
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

/**
 * Check Redis health
 */
export function checkRedisHealth(client: CustomClient): boolean {
    if (!client.redis) return false
    return simplifiedHealthCheck.isHealthy()
}

/**
 * Check database health
 */
export function checkDatabaseHealth(_client: CustomClient): boolean {
    return simplifiedHealthCheck.isHealthy()
}

/**
 * Check music health
 */
export function checkMusicHealth(_client: CustomClient): boolean {
    return simplifiedHealthCheck.isHealthy()
}

/**
 * Generate health report
 */
export async function generateHealthReport(
    client: CustomClient,
) {
    const services = [
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
