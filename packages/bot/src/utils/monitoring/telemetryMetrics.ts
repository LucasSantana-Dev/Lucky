import type { CustomClient } from '../../types'
import { simplifiedMetrics } from './SimplifiedTelemetry'

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
    simplifiedMetrics.commandDuration.observe(
        { command: commandName },
        executionTime,
    )
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
    simplifiedMetrics.musicActions.inc({ action, guild_id: guildId })
}

export function recordErrorMetric(
    client: CustomClient,
    errorType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
): void {
    if (!client.metrics) return
    simplifiedMetrics.errors.inc({ type: errorType, severity })
}
