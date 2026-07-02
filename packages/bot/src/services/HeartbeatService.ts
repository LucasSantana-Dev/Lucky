import type { Client } from 'discord.js'
import { debugLog, parseIntEnv } from '@lucky/shared/utils'

const DEFAULT_INTERVAL_MS = 60_000
const PING_TIMEOUT_MS = 10_000

export class HeartbeatService {
    private timer: ReturnType<typeof setInterval> | null = null
    private client: Client | null = null
    private tickInProgress = false

    start(client: Client): void {
        if (this.timer) return

        const pingUrl = process.env.HEARTBEAT_PING_URL
        if (!pingUrl) {
            debugLog({
                message:
                    'Heartbeat service disabled: HEARTBEAT_PING_URL not configured',
            })
            return
        }

        this.client = client
        const intervalMs = parseIntEnv(
            'HEARTBEAT_INTERVAL_MS',
            DEFAULT_INTERVAL_MS,
            { min: 1000 },
        )

        debugLog({
            message: 'Heartbeat service started',
            data: { intervalMs },
        })

        void this.tick(pingUrl)
        this.timer = setInterval(() => {
            void this.tick(pingUrl)
        }, intervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        this.client = null
    }

    private async tick(pingUrl: string): Promise<void> {
        if (this.tickInProgress) return

        // Ping only while the gateway is connected — a zombie process must go
        // silent so the dead-man monitor fires. Absence of pings IS the alert.
        if (!this.client?.isReady()) return

        this.tickInProgress = true
        try {
            const response = await fetch(pingUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(PING_TIMEOUT_MS),
            })
            if (!response.ok) {
                debugLog({
                    message: 'Heartbeat ping returned non-OK status',
                    data: { status: response.status },
                })
            }
        } catch (error) {
            // A down monitor must not spam error telemetry or Sentry — the
            // missed ping is the alarm, not this failure.
            debugLog({ message: 'Heartbeat ping failed', error })
        } finally {
            this.tickInProgress = false
        }
    }
}

export const heartbeatService = new HeartbeatService()
