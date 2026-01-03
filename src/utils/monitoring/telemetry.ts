// Simplified telemetry using only Sentry
import type { ChatInputCommandInteraction, Interaction } from 'discord.js'
import type { CustomClient } from '../../types'
import { getCategoryFromCommandName } from '../command/commandCategory'
import { simplifiedTracer, type TelemetrySpan } from './SimplifiedTelemetry'

type SpanAttributeValue = string | number | boolean | undefined

/**
 * Create a span for command execution
 * @param interaction The interaction that triggered the command
 * @param client The Discord client
 * @returns A span for the command execution
 */
export function createCommandSpan(
    interaction: ChatInputCommandInteraction,
    _client: CustomClient,
) {
    const span = simplifiedTracer.startSpan('command_execution')

    span.setAttributes({
        'command.name': interaction.commandName,
        'command.user_id': interaction.user.id,
        'command.guild_id': interaction.guild?.id || 'dm',
        'command.channel_id': interaction.channel?.id || 'unknown',
    })

    const category = getCategoryFromCommandName(interaction.commandName)
    if (category) {
        span.setAttribute('command.category', category)
    }

    return span
}

/**
 * Create a span for interaction handling
 * @param interaction The interaction being handled
 * @param client The Discord client
 * @returns A span for the interaction
 */
export function createInteractionSpan(
    interaction: Interaction,
    _client: CustomClient,
) {
    const span = simplifiedTracer.startSpan('interaction_handling')

    span.setAttributes({
        'interaction.type': interaction.type.toString(),
        'interaction.user_id': interaction.user.id,
        'interaction.guild_id': interaction.guild?.id || 'dm',
        'interaction.channel_id': interaction.channel?.id || 'unknown',
    })

    if (interaction.isChatInputCommand()) {
        span.setAttribute('interaction.command_name', interaction.commandName)
    }

    return span
}

/**
 * Set span attributes from a record
 * @param span The span to set attributes on
 * @param attributes The attributes to set
 */
export function setSpanAttributes(
    span: { setAttribute: (key: string, value: unknown) => void },
    attributes: Record<string, SpanAttributeValue>,
): void {
    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined) {
            span.setAttribute(key, value)
        }
    })
}

/**
 * Mark a span as successful
 * @param span The span to mark
 */
export function markSpanSuccess(span: {
    setStatus: (status: { code: number }) => void
    end: () => void
}): void {
    span.setStatus({ code: 1 }) // OK
    span.end()
}

/**
 * Mark a span as failed
 * @param span The span to mark
 * @param error The error that caused the failure
 */
export function markSpanError(
    span: {
        setStatus: (status: { code: number; message: string }) => void
        end: () => void
        recordException: (error: Error) => void
    },
    error: Error,
): void {
    span.setStatus({
        code: 2, // ERROR
        message: error.message,
    })
    ;(span as TelemetrySpan).recordException(error)
    ;(span as TelemetrySpan).end()
}
