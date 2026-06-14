import 'express'

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /**
             * Per-request correlation id, assigned by the `requestId`
             * middleware (honours a sane inbound `X-Request-Id`, else minted).
             * Threaded into request logs so a single request can be traced
             * across log lines. See decisions/2026-06-01-logging-observability-hardening.md (Track C7).
             */
            requestId?: string
        }
    }
}
