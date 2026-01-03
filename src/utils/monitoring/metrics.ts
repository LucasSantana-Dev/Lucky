import type { CustomClient } from '../../types'
import type { MetricsClient } from './SimplifiedTelemetry'

/**
 * Record a command execution metric
 * @param client The Discord client
 * @param commandName The name of the command
 * @param executionTime The time it took to execute the command
 * @param success Whether the command executed successfully
 */
export function recordCommandMetric(
    client: CustomClient,
    commandName: string,
    executionTime: number,
    success: boolean,
): void {
    if (!client.metrics) return
    ;(client.metrics as MetricsClient).commandExecutions
        .inc({
            command: commandName,
            success: success.toString(),
        })
    ;(client.metrics as MetricsClient)
        .commandDuration.observe({ command: commandName }, executionTime)
}

/**
 * Record an interaction metric
 * @param client The Discord client
 * @param interactionType The type of interaction
 * @param success Whether the interaction was handled successfully
 */
export function recordInteractionMetric(
    client: CustomClient,
    interactionType: string,
    success: boolean,
): void {
    if (!client.metrics) return
    ;(client.metrics as MetricsClient).interactions.inc({
        type: interactionType,
        success: success.toString(),
    })
}

/**
 * Record a music-related metric
 * @param client The Discord client
 * @param action The music action performed
 * @param guildId The guild ID where the action occurred
 */
export function recordMusicMetric(
    client: CustomClient,
    action: string,
    guildId: string,
): void {
    if (!client.metrics) return
    ;(client.metrics as MetricsClient).musicActions.inc({
        action,
        guild_id: guildId,
    })
}

/**
 * Record an error metric
 * @param client The Discord client
 * @param errorType The type of error
 * @param severity The severity of the error
 */
export function recordErrorMetric(
    client: CustomClient,
    errorType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
): void {
    if (!client.metrics) return
    ;(client.metrics as MetricsClient).errors.inc({
        type: errorType,
        severity,
    })
}
