import {
    captureMessage,
    flushSentry,
    initializeSentry,
    isSentryEnabled,
} from '@lucky/shared/utils'

async function main(): Promise<void> {
    initializeSentry({
        appName: process.env.SENTRY_APP_NAME ?? 'lucky',
        serviceName: process.env.SENTRY_SERVICE_NAME ?? 'bot',
        release: process.env.SENTRY_RELEASE,
        serverName: process.env.SENTRY_SERVER_NAME ?? process.env.HOSTNAME,
        environment: process.env.SENTRY_ENVIRONMENT,
        tags: { runtime: 'discord-bot', trigger: 'manual-sentry-test' },
    })

    if (!isSentryEnabled()) {
        throw new Error(
            'Sentry is not enabled. Set SENTRY_DSN and a non-development environment before running sentry:test.',
        )
    }

    const timestamp = new Date().toISOString()
    const message =
        process.env.SENTRY_TEST_MESSAGE ??
        'Lucky bot manual Sentry verification event'

    captureMessage(message, 'warning', {
        eventType: 'manual-sentry-test',
        service: process.env.SENTRY_SERVICE_NAME ?? 'bot',
        environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        timestamp,
    })

    const flushed = await flushSentry(5000)
    if (!flushed) {
        throw new Error(
            'Sentry did not flush the manual verification event within 5000ms.',
        )
    }

    console.log(`Sentry test event queued successfully at ${timestamp}.`)
}

await main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Sentry test failed: ${message}`)
    process.exit(1)
})
