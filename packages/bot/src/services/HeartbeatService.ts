import type { Client } from 'discord.js'
import { debugLog, errorLog, parseIntEnv } from '@lucky/shared/utils'

const DEFAULT_INTERVAL_MS = 60000

let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let client: Client | null = null
let tickInProgress = false

export const heartbeatService = {
    start(discordClient: Client): void {
        client = discordClient
        const pingUrl = process.env.HEARTBEAT_PING_URL
        if (!pingUrl) {
            debugLog({
                message: 'Heartbeat service disabled: HEARTBEAT_PING_URL not configured',
            })
            return
        }

        const intervalMs = parseIntEnv('HEARTBEAT_INTERVAL_MS', DEFAULT_INTERVAL_MS, {
            min: 1000,
        })

        debugLog({
            message: 'Heartbeat service started',
            data: { intervalMs, pingUrl },
        })

        // Ping immediately (best-effort, likely not ready yet)
        void pingHealthcheck(pingUrl)

        // Schedule periodic pings
        heartbeatInterval = setInterval(() => {
            void pingHealthcheck(pingUrl)
        }, intervalMs)
    },

    stop(): void {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval)
            heartbeatInterval = null
        }
        client = null
        debugLog({ message: 'Heartbeat service stopped' })
    },
}

async function pingHealthcheck(pingUrl: string): Promise<void> {
    // Prevent overlapping ticks
    if (tickInProgress) {
        return
    }

    // Ping only if client is ready — the absence of pings is the alert signal
    if (!client?.isReady()) {
        debugLog({
            message: 'Skipping heartbeat ping — client not ready',
        })
        return
    }

    tickInProgress = true
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        try {
            const response = await fetch(pingUrl, {
                method: 'GET',
                signal: controller.signal,
            })

            if (!response.ok) {
                debugLog({
                    message: 'Healthcheck ping returned non-OK status',
                    data: { status: response.status, url: pingUrl },
                })
            }
        } finally {
            clearTimeout(timeoutId)
        }
    } catch (error) {
        // Do not throw; log but continue. A down healthchecks or network error must not
        // spam error telemetry or Sentry. The absence of pings IS the alert.
        if (error instanceof Error && error.name !== 'AbortError') {
            debugLog({
                message: 'Heartbeat ping failed',
                data: { error: error.message, url: pingUrl },
            })
        }
    } finally {
        tickInProgress = false
    }
}
