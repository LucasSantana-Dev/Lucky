import { debugLog, infoLog } from '../general/log'

const DEFAULT_INTERVAL_MS = 60_000
const PING_TIMEOUT_MS = 5_000

export interface StartHeartbeatOptions {
    serviceName: string
}

let heartbeatTimer: ReturnType<typeof setInterval> | undefined

function resolveHeartbeatUrls(): string[] {
    return [process.env.HEALTHCHECK_URL, process.env.HEALTHCHECK_URL_EXTERNAL]
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
    const parsed = Number(process.env.HEALTHCHECK_INTERVAL_MS)
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
 * No-ops when neither `HEALTHCHECK_URL` nor `HEALTHCHECK_URL_EXTERNAL` is set, so it
 * is safe to call unconditionally in every environment. The running version
 * (`SENTRY_RELEASE` ?? `COMMIT_SHA`) is sent in the ping body so the monitor surfaces
 * which release is live.
 *
 * @returns a function that stops the heartbeat.
 */
export function startHeartbeat(options: StartHeartbeatOptions): () => void {
    const urls = resolveHeartbeatUrls()
    if (urls.length === 0) {
        debugLog({
            message: 'Heartbeat disabled (no HEALTHCHECK_URL configured)',
        })
        return () => undefined
    }

    const body = `${options.serviceName}@${resolveRunningVersion()}`
    const intervalMs = resolveIntervalMs()

    const sendAll = (): void => {
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
