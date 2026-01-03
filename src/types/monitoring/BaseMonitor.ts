/**
 * Base monitoring class with common telemetry patterns
 */

import type { CustomClient } from '../index'
import { createCommandSpan, createInteractionSpan } from '../../utils/monitoring/telemetry'
import { recordCommandMetric, recordInteractionMetric } from '../../utils/monitoring/SimplifiedTelemetryWrapper'
import type { ChatInputCommandInteraction, Interaction } from 'discord.js'

export interface MonitoringContext {
    userId: string
    guildId?: string
    commandName?: string
    interactionType?: string
}

export interface TelemetrySpan {
    setStatus: (status: { code: number; message?: string }) => void
    end: () => void
}

export abstract class BaseMonitor {
    protected readonly client: CustomClient

    constructor(client: CustomClient) {
        this.client = client
    }

    protected startCommandMonitoring(
        interaction: ChatInputCommandInteraction,
        context: MonitoringContext,
    ) {
        const span = createCommandSpan(interaction, this.client)

        return {
            span,
            startTime: Date.now(),
            context,
        }
    }

    protected endCommandMonitoring(
        monitoring: { span: TelemetrySpan; startTime: number; context: MonitoringContext },
        success: boolean,
    ) {
        const executionTime = Date.now() - monitoring.startTime

        recordCommandMetric(
            this.client,
            monitoring.context.commandName ?? 'unknown',
            success,
            executionTime,
        )

        if (success) {
            monitoring.span.setStatus({ code: 1 }) // OK
        } else {
            monitoring.span.setStatus({ code: 2, message: 'Error' }) // ERROR
        }

        monitoring.span.end()
    }

    protected startInteractionMonitoring(
        interaction: Interaction,
        context: MonitoringContext,
    ) {
        const span = createInteractionSpan(interaction, this.client)

        return {
            span,
            startTime: Date.now(),
            context,
        }
    }

    protected endInteractionMonitoring(
        monitoring: { span: TelemetrySpan; startTime: number; context: MonitoringContext },
        success: boolean,
    ) {
        recordInteractionMetric(
            this.client,
            monitoring.context.interactionType ?? 'unknown',
            success,
        )

        if (success) {
            monitoring.span.setStatus({ code: 1 }) // OK
        } else {
            monitoring.span.setStatus({ code: 2, message: 'Error' }) // ERROR
        }

        monitoring.span.end()
    }
}
