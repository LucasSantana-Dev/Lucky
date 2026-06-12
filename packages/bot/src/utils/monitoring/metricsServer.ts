import { createServer, type Server } from 'node:http'
import type { Client } from 'discord.js'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { parseIntEnv } from '@lucky/shared/utils/env'
import {
    metricsContentType,
    renderMetrics,
} from './prometheus'

const DEFAULT_PORT = 9091

let server: Server | null = null

/**
 * Start a tiny HTTP server exposing Prometheus metrics and a liveness probe.
 *
 * Routes:
 *   GET /metrics  → Prometheus text exposition (text/plain)
 *   GET /healthz  → 200 OK while the Discord client is ready, 503 otherwise
 *
 * The port comes from METRICS_PORT (default 9091). Bind address is 0.0.0.0
 * so the homelab Prometheus scraper inside the Docker network can reach it.
 *
 * No-ops if METRICS_DISABLED is set (useful for local CLI runs / tests).
 */
export function startMetricsServer(client: Client): Server | null {
    if (process.env.METRICS_DISABLED === 'true') {
        infoLog({ message: 'metricsServer: disabled via METRICS_DISABLED' })
        return null
    }
    if (server) {
        return server
    }

    const port = parseIntEnv('METRICS_PORT', DEFAULT_PORT)

    server = createServer((req, res) => {
        const url = req.url ?? '/'
        if (req.method !== 'GET') {
            res.writeHead(405, { 'content-type': 'text/plain' })
            res.end('method not allowed')
            return
        }
        if (url.startsWith('/metrics')) {
            renderMetrics()
                .then((body) => {
                    res.writeHead(200, { 'content-type': metricsContentType })
                    res.end(body)
                })
                .catch((error: unknown) => {
                    errorLog({
                        message: 'metricsServer: failed to render metrics',
                        error,
                    })
                    res.writeHead(500, { 'content-type': 'text/plain' })
                    res.end('internal error')
                })
            return
        }
        if (url.startsWith('/healthz')) {
            const ready = client.isReady()
            res.writeHead(ready ? 200 : 503, { 'content-type': 'text/plain' })
            res.end(ready ? 'ok' : 'not ready')
            return
        }
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
    })

    server.on('error', (error) => {
        errorLog({ message: 'metricsServer: socket error', error })
    })

    server.listen(port, '0.0.0.0', () => {
        infoLog({
            message: `metricsServer: listening on :${port} (/metrics, /healthz)`,
        })
    })

    return server
}

/**
 * Stop the metrics server. Safe to call multiple times.
 */
export async function stopMetricsServer(): Promise<void> {
    if (!server) return
    const closing = server
    server = null
    // Close any in-flight keep-alive connections so the server can shut down
    // promptly even if a client (e.g. a Prometheus scrape) is holding the
    // socket open.
    if (typeof closing.closeAllConnections === 'function') {
        closing.closeAllConnections()
    }
    await new Promise<void>((resolve) => {
        closing.close((err) => {
            if (err) {
                errorLog({ message: 'metricsServer: close error', error: err })
            }
            resolve()
        })
    })
}
