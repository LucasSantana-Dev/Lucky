export * from './sentry'
export {
    createCommandSpan,
    createInteractionSpan,
    markSpanError,
} from './SimplifiedTelemetryWrapper'
export * from './metrics'
export * from './health'

// Legacy exports for backward compatibility
export {
    addBreadcrumb,
    monitorCommandExecution,
    monitorInteractionHandling,
} from './sentry'

// Main initialization function
export { initializeSentry } from './sentry'
