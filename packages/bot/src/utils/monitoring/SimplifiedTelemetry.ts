/**
 * Simplified telemetry system without OpenTelemetry dependency.
 *
 * Class implementations + singletons live in `./clients`; interfaces
 * live in `./telemetryTypes`. This file is now a thin facade for span
 * creation + the public re-export surface kept for backwards
 * compatibility with consumers that imported everything from here
 * (`SimplifiedTelemetryWrapper`, `telemetry`, `health`, `metrics`).
 *
 * See docs/decisions/2026-05-16-next-refactor-target-bot-circular-deps.md
 * for the cycle-break rationale.
 */

import type { ChatInputCommandInteraction, Interaction } from 'discord.js'
import type { CustomClient } from '../../types'

export type {
    TelemetrySpan,
    TelemetryTracer,
    MetricsClient,
    HealthCheckClient,
} from './telemetryTypes'

import type { TelemetrySpan } from './telemetryTypes'

export {
    simplifiedTracer,
    simplifiedMetrics,
    simplifiedHealthCheck,
} from './clients'

import { simplifiedTracer } from './clients'

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
    span.setStatus({ code: 1 })
    span.end()
}

export function markSpanError(span: TelemetrySpan, error: Error): void {
    span.setStatus({ code: 2, message: error.message })
    span.recordException(error)
    span.end()
}

export {
    recordCommandMetric,
    recordInteractionMetric,
    recordMusicMetric,
    recordErrorMetric,
} from './telemetryMetrics'

export {
    checkRedisHealth,
    checkDatabaseHealth,
    checkMusicHealth,
    generateHealthReport,
} from './healthChecks'
export type { HealthCheck, HealthReport } from './healthChecks'
