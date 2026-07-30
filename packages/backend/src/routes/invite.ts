import type { Express, Request, Response } from 'express'
import { infoLog } from '@lucky/shared/utils'
import { logAndSwallow } from '@lucky/shared/utils/error'
import { buildBotInviteUrl } from '@lucky/shared/constants'
import { apiLimiter } from '../middleware/rateLimit'

// Was a hardcoded permissions=36970496 (Manage Messages, Use External Emojis,
// Connect, Speak, Use Voice Activity) — no View Channels, no Send Messages, so
// a bot invited with it could not read or post. Single source of truth now
// lives in shared (#1894), pinned to
// decisions/2026-06-18-invite-permission-scope.md (#1923).
const DISCORD_INVITE_URL = buildBotInviteUrl()

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

        res.redirect(302, DISCORD_INVITE_URL)
    })
}
