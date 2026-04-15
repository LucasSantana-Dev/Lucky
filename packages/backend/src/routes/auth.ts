import type { Express, Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { sessionService } from '../services/SessionService'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { authLimiter } from '../middleware/rateLimit'
import { handleOAuthCallback } from './authCallback'
import { getPrimaryFrontendUrl } from '../utils/frontendOrigin'
import { getOAuthRedirectUri } from '../utils/oauthRedirectUri'
import { isDeveloperUser } from '../utils/developerAccess'

const getFrontendUrl = (): string => {
    return getPrimaryFrontendUrl()
}

export function setupAuthRoutes(app: Express): void {
    app.get(
        '/api/auth/discord',
        authLimiter,
        async (req: Request, res: Response) => {
            try {
                req.session.oauthInitiated = true
                req.session.oauthRedirectUri = getOAuthRedirectUri(req)
                const stateBuffer = randomBytes(32)
                req.session.oauthState = stateBuffer.toString('hex')

                await new Promise<void>((resolve) => {
                    req.session.save((err) => {
                        if (err) {
                            errorLog({
                                message: 'Error saving session on OAuth init:',
                                error: err,
                            })
                        } else {
                            debugLog({
                                message: 'Session initialized for OAuth',
                                data: { sessionId: req.sessionID },
                            })
                        }
                        resolve()
                    })
                })

                const clientId = process.env.CLIENT_ID
                const redirectUri = req.session.oauthRedirectUri
                const scope = 'identify guilds'
                const state = req.session.oauthState

                if (!clientId) {
                    const frontendUrl = getFrontendUrl()
                    return res.redirect(
                        `${frontendUrl}/?error=auth_failed&message=client_id_not_configured`,
                    )
                }

                const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`

                res.redirect(authUrl)
            } catch (error) {
                errorLog({
                    message: 'Error in Discord OAuth redirect:',
                    error,
                })
                const frontendUrl = getFrontendUrl()
                res.redirect(
                    `${frontendUrl}/?error=auth_failed&message=redirect_error`,
                )
            }
        },
    )

    app.get('/api/auth/callback', handleOAuthCallback)
    app.get('/auth/callback', handleOAuthCallback)

    app.get(
        '/api/auth/logout',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const sessionId = req.sessionId

            if (sessionId) {
                await sessionService.deleteSession(sessionId)
            }

            req.session.destroy((err) => {
                if (err) {
                    errorLog({
                        message: 'Error destroying session:',
                        error: err,
                    })
                }
            })

            res.json({ success: true })
        }),
    )

    app.get('/api/auth/status', async (req: Request, res: Response) => {
        try {
            const sessionId = req.sessionID
            const cookies = req.headers.cookie

            debugLog({
                message: 'Auth status check',
                data: {
                    sessionId,
                    hasCookies: !!cookies,
                    cookieHeader: cookies,
                    sessionFromReq: req.session,
                },
            })

            if (!sessionId) {
                debugLog({ message: 'No sessionId found' })
                return res.json({ authenticated: false })
            }

            const sessionData = await sessionService.getSession(sessionId)

            debugLog({
                message: 'Session lookup result',
                data: {
                    sessionId,
                    found: !!sessionData,
                    hasUserId: !!sessionData?.userId,
                },
            })

            if (!sessionData) {
                return res.json({ authenticated: false })
            }

            res.json({
                authenticated: true,
                user: {
                    id: sessionData.user.id,
                    username: sessionData.user.username,
                    discriminator: sessionData.user.discriminator,
                    globalName: sessionData.user.global_name,
                    avatar: sessionData.user.avatar,
                    isDeveloper: isDeveloperUser(sessionData.user.id),
                },
            })
        } catch (error) {
            errorLog({
                message: 'Error checking auth status:',
                error,
            })
            res.json({ authenticated: false })
        }
    })

    app.get(
        '/api/auth/user',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            if (!req.user) {
                throw AppError.unauthorized()
            }

            res.json({
                id: req.user.id,
                username: req.user.username,
                discriminator: req.user.discriminator,
                globalName: req.user.globalName,
                avatar: req.user.avatar,
            })
        }),
    )
}
