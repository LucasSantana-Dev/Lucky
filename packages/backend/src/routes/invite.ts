import type { Express, Request, Response } from 'express'
import { infoLog } from '@lucky/shared/utils'

const DISCORD_INVITE_URL =
    'https://discord.com/oauth2/authorize?client_id=962198089161134131&scope=bot%20applications.commands&permissions=36970496'

export function setupInviteRoute(app: Express): void {
    app.get('/invite', (req: Request, res: Response) => {
        const { utm_source, utm_medium, utm_campaign, utm_content } = req.query

        infoLog({
            message: '[invite] click',
            data: { utm_source, utm_medium, utm_campaign, utm_content },
        })

        res.redirect(302, DISCORD_INVITE_URL)
    })
}
