import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * top.gg v1 webhook signature verification.
 *
 * Every v1 delivery carries `x-topgg-signature: t={unix timestamp},v1={signature}`
 * where the signature is a hex HMAC-SHA256 of `{timestamp}.{rawBody}` keyed with
 * the webhook secret (the `whs_`-prefixed value top.gg generates, used as-is).
 *
 * This replaces the v0 model, where the owner chose a shared secret and top.gg
 * echoed it in the `Authorization` header. v0 config is still accepted by the
 * route for existing setups, but any webhook created today is v1.
 */

// The docs do not name a tolerance, so this is our choice. Five minutes is the
// usual figure for signed webhooks (Stripe, GitHub) and bounds replay of a
// captured request without being tight enough to break on ordinary clock skew
// between top.gg and the host.
/**
 * The one path that receives v1 deliveries. Shared so the route and the
 * raw-body capture hook in the middleware cannot drift apart: if they did,
 * verification would start failing with `malformed-header` on every real
 * delivery.
 */
export const TOPGG_WEBHOOK_PATH = '/webhooks/topgg-votes'

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export type SignatureFailure =
    'missing-header' | 'malformed-header' | 'stale-timestamp' | 'bad-signature'

export type SignatureResult =
    { ok: true } | { ok: false; reason: SignatureFailure }

/**
 * Parse `t={unix},v1={hex}`. Order is not assumed, and unknown parts are
 * ignored so top.gg can add a `v2=` alongside `v1=` without breaking us.
 */
export function parseSignatureHeader(
    header: string,
): { timestamp: number; signature: string } | null {
    let timestamp: number | null = null
    let signature: string | null = null

    for (const part of header.split(',')) {
        const eq = part.indexOf('=')
        if (eq === -1) continue
        const key = part.slice(0, eq).trim()
        const value = part.slice(eq + 1).trim()
        if (key === 't') {
            if (!/^\d+$/.test(value)) return null
            timestamp = Number(value)
        } else if (key === 'v1') {
            if (!/^[a-f0-9]+$/i.test(value)) return null
            signature = value
        }
    }

    if (timestamp === null || signature === null) return null
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return null
    return { timestamp, signature }
}

export function verifyTopggSignature(params: {
    header: string | undefined
    rawBody: Buffer | undefined
    secret: string
    nowSeconds?: number
}): SignatureResult {
    const { header, rawBody, secret } = params
    if (!header) return { ok: false, reason: 'missing-header' }
    // A missing raw body cannot be distinguished from an empty one here, and
    // signing the wrong bytes would silently accept anything, so treat it as
    // malformed rather than guessing.
    if (!rawBody) return { ok: false, reason: 'malformed-header' }

    const parsed = parseSignatureHeader(header)
    if (!parsed) return { ok: false, reason: 'malformed-header' }

    const now = params.nowSeconds ?? Math.floor(Date.now() / 1000)
    // Absolute difference: a timestamp far in the FUTURE is as suspicious as a
    // stale one, and would otherwise extend the replay window indefinitely.
    if (Math.abs(now - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
        return { ok: false, reason: 'stale-timestamp' }
    }

    const expected = createHmac('sha256', secret)
        .update(`${parsed.timestamp}.`)
        .update(rawBody)
        .digest('hex')

    // Compare the decoded bytes, not the hex text. The parser accepts either
    // case, so comparing strings would reject a valid uppercase signature
    // against a digest that is always lowercase.
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(parsed.signature, 'hex')
    // timingSafeEqual throws on length mismatch, which would leak length via an
    // exception path, so compare lengths first and still run the constant-time
    // compare when they match.
    if (a.length !== b.length) return { ok: false, reason: 'bad-signature' }
    if (!timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' }

    return { ok: true }
}
