/* eslint-disable no-console */
import * as Sentry from "@sentry/node"
import { nodeProfilingIntegration } from "@sentry/profiling-node"
import { SpanStatusCode } from "@opentelemetry/api"
import type { ChatInputCommandInteraction, Interaction } from "discord.js"
import type { ICustomClient } from "../../types"
import { getCommandCategory } from "../command/commandCategory"

/**
 * Capture an exception in Sentry
 * @param error The error to capture
 * @param extras Additional data to include with the exception
 */
export function captureException(
    error: Error,
    extras?: Record<string, unknown>,
): void {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return
    }

    Sentry.captureException(error, { extra: extras })
}

/**
 * Capture a message in Sentry
 * @param message The message to capture
 * @param level The severity level
 * @param extras Additional data to include with the message
 */
export function captureMessage(
    message: string,
    level: Sentry.SeverityLevel = "info",
    extras?: Record<string, unknown>,
): void {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return
    }

    Sentry.captureMessage(message, {
        level,
        extra: extras,
    })
}

/**
 * Initialize Sentry monitoring with appropriate configuration
 */
export function initializeSentry() {
    if (!process.env.SENTRY_DSN) return

    // Suppress Sentry in development environment
    const isDevelopment = process.env.NODE_ENV === "development"

    if (isDevelopment) {
        console.log("Sentry monitoring disabled in development environment")
        return
    }

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 1.0,
        environment: process.env.NODE_ENV ?? "development",
        integrations: [nodeProfilingIntegration()],
        profileSessionSampleRate: 1.0,
        profileLifecycle: "trace",
        sendDefaultPii: true,
        release: process.env.npm_package_version ?? "2.0.0",
        tracesSampler: (samplingContext) => {
            if (samplingContext.transactionContext?.name?.includes("command")) {
                return 1.0
            }
            return 0.5
        },
    })

    if (process.env.CLIENT_ID) {
        Sentry.setTag("botId", process.env.CLIENT_ID)
    }
}

/**
 * Wraps a function with Sentry performance monitoring
 * @param operationName Name of the operation for the transaction
 * @param fn The function to monitor
 * @param context Additional context data to add to the transaction
 * @returns The result of the function
 */
export async function withSentryMonitoring<T>(
    operationName: string,
    fn: () => Promise<T>,
    context: Record<string, unknown> = {},
): Promise<T> {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return fn()
    }

    let result: T
    let error: unknown

    await Sentry.startSpan(
        {
            op: "function",
            name: operationName,
        },
        async (span) => {
            Object.entries(context).forEach(([key, value]) => {
                const attributeValue =
                    typeof value === "object" && value !== null
                        ? JSON.stringify(value)
                        : value
                span.setAttribute(key, attributeValue)
            })

            try {
                const startTime = performance.now()
                result = await fn()
                const endTime = performance.now()

                span.setAttribute("execution_time_ms", endTime - startTime)
                span.setStatus({ code: SpanStatusCode.OK })
            } catch (e) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: e instanceof Error ? e.message : String(e),
                })
                span.setAttribute(
                    "error",
                    e instanceof Error ? e.message : String(e),
                )
                error = e
            }
        },
    )

    // Re-throw the error if one occurred
    if (error) {
        throw error
    }

    return result
}

/**
 * Creates a child span for the current transaction
 * @param operationName Name of the operation for the span
 * @param context Additional context data to add to the span
 * @returns The created span or undefined if Sentry is not configured
 */
export function createSpan(
    operationName: string,
    context: Record<string, unknown> = {},
): Sentry.Span | undefined {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return undefined
    }

    const activeSpan = Sentry.getActiveSpan()
    if (!activeSpan) {
        return undefined
    }

    const span = Sentry.startSpan(
        {
            name: operationName,
            op: "span",
        },
        (innerSpan) => {
            Object.entries(context).forEach(([key, value]) => {
                const attributeValue =
                    typeof value === "object" && value !== null
                        ? JSON.stringify(value)
                        : value
                innerSpan.setAttribute(key, attributeValue)
            })
            return innerSpan
        },
    )

    return span
}

/**
 * Sets user context in Sentry
 * @param userId User ID
 * @param username User name
 * @param additionalData Additional user data
 */
export function setUserContext(
    userId: string,
    username: string,
    additionalData: Record<string, unknown> = {},
): void {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return
    }

    Sentry.setUser({
        id: userId,
        username,
        ...additionalData,
    })
}

/**
 * Monitors interaction handling with Sentry performance tracking
 * @param interaction The interaction object
 * @param client The Discord client
 * @param handlerFn The function to handle the interaction
 */
export async function monitorInteractionHandling(
    interaction: Interaction,
    _client: ICustomClient,
    handlerFn: () => Promise<void>,
): Promise<void> {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return handlerFn()
    }

    await Sentry.startSpan(
        {
            op: "interaction",
            name: interaction.isChatInputCommand()
                ? `command.${interaction.commandName}`
                : `interaction.${interaction.type}`,
        },
        async (span) => {
            if (interaction.isChatInputCommand()) {
                span.setAttribute("command", interaction.commandName)
                span.setAttribute(
                    "options",
                    JSON.stringify(interaction.options.data),
                )
            }

            if (interaction.user) {
                Sentry.setUser({
                    id: interaction.user.id,
                    username: interaction.user.username,
                })
            }

            if (interaction.guild) {
                span.setAttribute("guild.id", interaction.guild.id)
                span.setAttribute("guild.name", interaction.guild.name)
            }

            try {
                await handlerFn()

                span.setStatus({ code: SpanStatusCode.OK })
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message:
                        error instanceof Error ? error.message : String(error),
                })
                span.setAttribute(
                    "error_message",
                    error instanceof Error ? error.message : String(error),
                )
                throw error
            }
        },
    )
}

/**
 * Adds a breadcrumb to the current Sentry scope
 * @param category Breadcrumb category
 * @param message Breadcrumb message
 * @param level Breadcrumb level
 * @param data Additional data
 */
export function addBreadcrumb(
    category: string,
    message: string,
    level: Sentry.SeverityLevel = "info",
    data: Record<string, unknown> = {},
): void {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return
    }

    Sentry.addBreadcrumb({
        category,
        message,
        level,
        data: data ? { ...data } : undefined,
    })
}

/**
 * Monitors command execution with Sentry performance tracking
 * @param interaction The command interaction
 * @param client The Discord client
 * @param executeCommandFn The function to execute the command
 */
export async function monitorCommandExecution(
    interaction: ChatInputCommandInteraction,
    client: ICustomClient,
    executeCommandFn: () => Promise<void>,
): Promise<void> {
    if (!process.env.SENTRY_DSN || process.env.NODE_ENV === "development") {
        return executeCommandFn()
    }

    await Sentry.startSpan(
        {
            name: `Process command ${interaction.commandName}`,
            op: "command.process",
        },
        async (span) => {
            try {
                const command = client.commands.get(interaction.commandName)
                if (!command) {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: "Command not found",
                    })
                    return
                }

                const category = getCommandCategory(command)

                span.setAttribute("command_category", category)
                span.setAttribute(
                    "command_description",
                    command.data.description,
                )

                if (interaction.options.data.length > 0) {
                    span.setAttribute(
                        "command_options",
                        JSON.stringify(
                            interaction.options.data.map((opt) => ({
                                name: opt.name,
                                type: opt.type,
                                value: opt.value,
                            })),
                        ),
                    )
                }

                const startTime = performance.now()
                await executeCommandFn()
                const endTime = performance.now()

                span.setAttribute("execution_time_ms", endTime - startTime)
                span.setStatus({ code: SpanStatusCode.OK })
            } catch (error) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message:
                        error instanceof Error ? error.message : String(error),
                })
                span.setAttribute(
                    "error_message",
                    error instanceof Error ? error.message : String(error),
                )
                throw error
            }
        },
    )
}
