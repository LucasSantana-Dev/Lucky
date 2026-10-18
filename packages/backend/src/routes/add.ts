import type { Express, Request, Response } from 'express'
import { infoLog } from '@lucky/shared/utils'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { buildBotAddUrl, normalizeLandingSource } from '@lucky/shared/constants'
import { apiLimiter } from '../middleware/rateLimit'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'

/**
 * Landing "Add to Discord" target (#2750). Redirects to the canonical bot add
 * URL (same permissions as /invite) with `state=src.<source>` and the existing
 * OAuth redirect URI. The source is validated against the shared allowlist;
 * the redirect target is always Discord, never user supplied.
 */
export function setupAddRoute(app: Express): void {
    app.get('/api/add', apiLimiter, (req: Request, res: Response) => {
        const source = normalizeLandingSource(req.query.source)

        try {
            infoLog({ message: '[add] click', data: { source } })
        } catch (err) {
            logAndSwallow(err, 'add.infoLog')
        }

        res.redirect(302, buildBotAddUrl(source, getOAuthRedirectUri(req)))
    })
}
