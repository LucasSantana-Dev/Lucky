import express, { type Express, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { warnLog } from '@lucky/shared/utils'
import { captureMessageThrottled } from '@lucky/shared/utils/monitoring'

/**
 * Same-origin sink for CSP violation reports (#1283).
 *
 * The CSP `report-uri` directive (set in nginx.conf and vercel.json while the
 * policy is in Report-Only mode) points browsers here so violations are
 * collected centrally instead of only surfacing in each user's console. Reports
 * are logged (greppable `csp-violation`) and forwarded to Sentry — the ADR's
 * intended destination — without committing the Sentry DSN to nginx/vercel.json.
 *
 * Security posture for an unauthenticated public endpoint: a dedicated strict
 * rate limit, a small body cap, and a field allowlist (never log/forward
 * arbitrary attacker-supplied JSON).
 */

// CSP reports are low-volume on legitimate page loads; cap hard to keep an
// open endpoint from flooding logs or Sentry.
const cspReportLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
})

// Browsers POST violations as `application/csp-report` (legacy report-uri) or
// `application/reports+json` (Reporting API). The global express.json() only
// parses application/json and leaves these untouched, so re-parse here.
const cspBodyParser = express.json({
    type: [
        'application/csp-report',
        'application/reports+json',
        'application/json',
    ],
    limit: '16kb',
})

const MAX_FIELD_LENGTH = 512

const str = (value: unknown): string | undefined =>
    typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : undefined

/**
 * Extract the report payload(s). Legacy report-uri sends `{ "csp-report": {…} }`;
 * the Reporting API sends an array of `{ type, body: {…} }`.
 */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : undefined

const extractReports = (body: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(body)) {
        return (body as unknown[])
            .map((entry) => {
                const record = asRecord(entry)
                return record && 'body' in record
                    ? asRecord(record.body)
                    : record
            })
            .filter((entry): entry is Record<string, unknown> => !!entry)
    }
    const record = asRecord(body)
    if (record) {
        const wrapped = asRecord(record['csp-report'])
        return wrapped ? [wrapped] : [record]
    }
    return []
}

// Allowlist the fields we record, accepting both the kebab-case (report-uri)
// and camelCase (Reporting API) spellings.
const pickReportFields = (report: Record<string, unknown>) => ({
    documentUri: str(report['document-uri'] ?? report['documentURL']),
    violatedDirective: str(
        report['violated-directive'] ??
            report['effective-directive'] ??
            report['effectiveDirective'],
    ),
    blockedUri: str(report['blocked-uri'] ?? report['blockedURL']),
    disposition: str(report['disposition']),
})

export function setupSecurityRoutes(app: Express): void {
    app.post(
        '/api/security/csp-report',
        cspReportLimiter,
        cspBodyParser,
        (req: Request, res: Response) => {
            try {
                for (const raw of extractReports(req.body)) {
                    const fields = pickReportFields(raw)
                    // Ignore empty/garbage payloads — only act on a real violation.
                    if (!fields.violatedDirective && !fields.blockedUri) continue

                    warnLog({ message: 'csp-violation', data: fields })
                    captureMessageThrottled(
                        `csp:${fields.violatedDirective ?? 'unknown'}`,
                        `CSP violation: ${
                            fields.violatedDirective ?? 'unknown'
                        } blocked ${fields.blockedUri ?? 'unknown'}`,
                        'warning',
                        fields,
                    )
                }
            } catch {
                // A malformed report must never surface an error to the browser.
            }
            res.status(204).end()
        },
    )
}
