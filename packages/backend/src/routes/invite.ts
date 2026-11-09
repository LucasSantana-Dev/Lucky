import type { Express, Request, Response } from 'express'
import { infoLog } from '@lucky/shared/utils'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { buildBotAddUrl } from '@lucky/shared/constants'
import { apiLimiter } from '../middleware/rateLimit'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'

// Permissions come from the shared invite URL (#1894, #1923). The redirect
// goes through the add flow (#2750), so `utm_source` survives the Discord
// OAuth as `state=src.<source>` and the callback records where the guild came
// from. Sources off the allowlist are stored as `unknown`.

function toUtmString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
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
    })
}
