import type { Request, Response, NextFunction } from 'express'
import { mintCorrelationId } from '@lucky/shared/utils/support'

const REQUEST_ID_HEADER = 'x-request-id'
const RESPONSE_HEADER = 'X-Request-Id'

// An inbound id is attacker-controllable and gets logged, so it is only
// honoured when it matches the same safe, bounded charset `mintCorrelationId`
// produces ([A-Za-z0-9_-], 1-64 chars). Anything else (newlines for log
// injection, oversized values) is dropped and a fresh id is minted. The
// pattern is anchored with a single bounded quantifier — no ReDoS surface.
const SAFE_INBOUND_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Assigns a correlation id to every request: honours a valid inbound
 * `X-Request-Id` (so an upstream proxy / client trace id is preserved across
 * the Cloudflare tunnel + nginx hop), otherwise mints a fresh one. Exposes it
 * on `req.requestId` and echoes it back as the `X-Request-Id` response header
 * for client-side correlation.
 *
 * Must be registered BEFORE `requestLogger` so the id is available to the
 * request-summary log line.
 */
export function requestId(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const inbound = req.get(REQUEST_ID_HEADER)
    const id =
        inbound && SAFE_INBOUND_ID.test(inbound) ? inbound : mintCorrelationId()

    req.requestId = id
    res.setHeader(RESPONSE_HEADER, id)
    next()
}
