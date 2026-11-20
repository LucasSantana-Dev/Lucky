import type { Express, Request, Response } from 'express'
import { getPrismaClient, infoLog } from '@lucky/shared/utils'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { buildBotAddUrl } from '@lucky/shared/constants'
import { apiLimiter } from '../middleware/rateLimit'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'

// Permissions come from the shared invite URL (#1894, #1923). The redirect
// goes through the add flow (#2750), so `utm_source` survives the Discord
// OAuth as `state=src.<source>` and the callback records where the guild came
// from. Sources off the allowlist are stored as `unknown`.

// Stored values are capped so a crafted link cannot write large rows.
const MAX_FIELD_LENGTH = 100

// A repeated key arrives as an array. Keep the first value: discordbotlist
// appends its own `utm_source=discordbotlist.com` after the listing's link,
// which turned every click from that listing into `unknown`.
function toUtmString(value: unknown): string | undefined {
    const first: unknown = Array.isArray(value)
        ? (value as unknown[])[0]
        : value
    return typeof first === 'string' ? first : undefined
}

function cap(value: string | undefined): string | null {
    return value ? value.slice(0, MAX_FIELD_LENGTH) : null
}

/** Host of the Referer header, or null. Never the path or query. */
export function referrerHostOf(referer: string | undefined): string | null {
    if (!referer) return null
    try {
        return cap(new URL(referer).hostname || undefined)
    } catch {
        return null
    }
}

type InviteClickFields = {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    referer?: string
}

// Fire-and-forget (obs P4, #2395): the redirect never waits on this write and
// a failure only logs.
function recordInviteClick(fields: InviteClickFields): void {
    try {
        getPrismaClient()
            .inviteClick.create({
                data: {
                    utmSource: cap(fields.utm_source),
                    utmMedium: cap(fields.utm_medium),
                    utmCampaign: cap(fields.utm_campaign),
                    utmContent: cap(fields.utm_content),
                    referrerHost: referrerHostOf(fields.referer),
                },
            })
            .catch((err: unknown) => {
                logAndSwallow(err, 'invite.recordClick')
            })
    } catch (err) {
        logAndSwallow(err, 'invite.recordClick')
    }
}

export function setupInviteRoute(app: Express): void {
    app.get('/invite', apiLimiter, (req: Request, res: Response) => {
        const utm_source = toUtmString(req.query.utm_source)
        const utm_medium = toUtmString(req.query.utm_medium)
        const utm_campaign = toUtmString(req.query.utm_campaign)
        const utm_content = toUtmString(req.query.utm_content)

        try {
            infoLog({
                message: '[invite] click',
                data: { utm_source, utm_medium, utm_campaign, utm_content },
            })
        } catch (err) {
            logAndSwallow(err, 'invite.infoLog')
        }

        res.redirect(302, buildBotAddUrl(utm_source, getOAuthRedirectUri(req)))

        recordInviteClick({
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            referer: req.get('referer'),
        })
    })
}
