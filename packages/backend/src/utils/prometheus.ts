import {
    Registry,
    collectDefaultMetrics,
    Counter,
    Histogram,
} from 'prom-client'

/**
 * Shared Prometheus registry for the backend. Mounted at GET /metrics.
 */
export const registry = new Registry()

registry.setDefaultLabels({ service: 'lucky-backend' })
collectDefaultMetrics({ register: registry })

/**
 * Counter: total HTTP requests served, labelled by method, route template
 * (NOT raw path — we use `req.route.path` so cardinality stays bounded),
 * and status code.
 */
export const httpRequestsTotal = new Counter<'method' | 'route' | 'status'>({
    name: 'lucky_backend_http_requests_total',
    help: 'Count of HTTP requests handled by the backend, labelled by method, route template, and status code.',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
})

/**
 * Histogram: HTTP request duration in seconds. Buckets tuned for typical
 * API workloads (sub-50ms to ~5s p99).
 */
export const httpRequestDurationSeconds = new Histogram<
    'method' | 'route' | 'status'
>({
    name: 'lucky_backend_http_request_duration_seconds',
    help: 'HTTP request duration in seconds, observed at response finish.',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
})

/**
 * Counter: HTTP errors (status >= 500) classified by method and route.
 * Separate from the total counter for easier alerting.
 */
export const httpServerErrorsTotal = new Counter<'method' | 'route'>({
    name: 'lucky_backend_http_server_errors_total',
    help: 'Count of HTTP 5xx responses, labelled by method and route template.',
    labelNames: ['method', 'route'],
    registers: [registry],
})

/**
 * Counter: Guild Automation usage (plan/apply attempts), labelled by operation type and guild.
 * Cardinality is bounded: we label by operation type (plan|apply|reconcile) and count total attempts.
 */
export const guildAutomationUsageTotal = new Counter<'operation'>({
    name: 'lucky_guild_automation_usage_total',
    help: 'Count of Guild Automation plan/apply/reconcile attempts, labelled by operation type.',
    labelNames: ['operation'],
    registers: [registry],
})
