import { debugLog, infoLog } from '../general/log'

const DEFAULT_INTERVAL_MS = 60_000
const PING_TIMEOUT_MS = 5_000

export interface StartHeartbeatOptions {
    serviceName: string
    /**
     * Optional readiness gate. When provided, a tick is skipped entirely
     * (no ping to any URL) unless this returns true. The bot passes its
     * Discord gateway `client.isReady()` here so a zombie process goes
     * silent and the dead-man monitor fires: absence of pings IS the
     * alert. Omit for services that are always considered ready (the
     * backend has no equivalent "connected" state to gate on).
     */
    isReady?: () => boolean
}

let heartbeatTimer: ReturnType<typeof setInterval> | undefined

function resolveHeartbeatUrls(): string[] {
    return [
        process.env.HEARTBEAT_PING_URL,
        process.env.HEARTBEAT_PING_URL_EXTERNAL,
    ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
}

function resolveRunningVersion(): string {
    return (
        process.env.SENTRY_RELEASE?.trim() ||
        process.env.COMMIT_SHA?.trim() ||
        'unknown'
    )
}

function resolveIntervalMs(): number {
    const parsed = Number(process.env.HEARTBEAT_INTERVAL_MS)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS
}

async function ping(url: string, body: string): Promise<void> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
    timeout.unref?.()

    try {
        await fetch(url, { method: 'POST', body, signal: controller.signal })
    } catch (error) {
        // A missed ping is itself the alert signal on the monitor side; never throw.
        debugLog({ message: 'Heartbeat ping failed', error })
    } finally {
        clearTimeout(timeout)
    }
}

/**
 * Start a periodic liveness heartbeat to an external monitor (e.g. Healthchecks).
 *
 * No-ops when neither `HEARTBEAT_PING_URL` (on-box) nor
 * `HEARTBEAT_PING_URL_EXTERNAL` (off-box) is set, so it is safe to call
 * unconditionally in every environment. The running version (`SENTRY_RELEASE`
 * ?? `COMMIT_SHA`) is sent in the ping body so the monitor surfaces which
 * release is live.
 *
 * @returns a function that stops the heartbeat.
 */
export function startHeartbeat(options: StartHeartbeatOptions): () => void {
    const urls = resolveHeartbeatUrls()
    if (urls.length === 0) {
        debugLog({
            message: 'Heartbeat disabled (no HEARTBEAT_PING_URL configured)',
        })
        return () => undefined
    }

    const body = `${options.serviceName}@${resolveRunningVersion()}`
    const intervalMs = resolveIntervalMs()

    const sendAll = (): void => {
        // Ping only while ready (when a gate is given): a zombie process
        // must go silent so the dead-man monitor fires. Absence of pings IS
        // the alert.
        if (options.isReady && !options.isReady()) return
        for (const url of urls) {
            void ping(url, body)
        }
    }

    sendAll()
    heartbeatTimer = setInterval(sendAll, intervalMs)
    heartbeatTimer.unref?.()

    infoLog({
        message: 'Heartbeat started',
        data: {
            serviceName: options.serviceName,
            intervalMs,
            targets: urls.length,
        },
    })

    return stopHeartbeat
}

export function stopHeartbeat(): void {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = undefined
    }
}
