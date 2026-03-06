import type { Express, Request, Response } from 'express'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import { sessionService } from '../services/SessionService'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { handleOAuthCallback } from './authCallback'

const getFrontendUrl = (): string => {
    return process.env.WEBAPP_FRONTEND_URL ?? 'http://localhost:5173'
}

export function setupAuthRoutes(app: Express): void {
    app.get('/api/auth/discord', async (req: Request, res: Response) => {
        try {
            req.session.oauthInitiated = true

            await new Promise<void>((resolve) => {
                req.session.save((err) => {
                    if (err) {
                        errorLog({ message: 'Error saving session on OAuth init:', error: err })
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
            const redirectUri = process.env.WEBAPP_REDIRECT_URI ?? `http://localhost:${process.env.WEBAPP_PORT ?? '3000'}/api/auth/callback`
            const scope = 'identify guilds'

            if (!clientId) {
                const frontendUrl = getFrontendUrl()
                return res.redirect(
                    `${frontendUrl}/?error=auth_failed&message=client_id_not_configured`,
                )
            }

            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`

            res.redirect(authUrl)
        } catch (error) {
            errorLog({ message: 'Error in Discord OAuth redirect:', error })
            const frontendUrl = getFrontendUrl()
            res.redirect(
                `${frontendUrl}/?error=auth_failed&message=redirect_error`,
            )
        }
    })

    app.get('/api/auth/callback', handleOAuthCallback)

    app.get('/api/auth/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const sessionId = req.sessionId

            if (sessionId) {
                await sessionService.deleteSession(sessionId)
            }

            req.session.destroy((err) => {
                if (err) {
                    errorLog({ message: 'Error destroying session:', error: err })
                }
            })

            res.json({ success: true })
        } catch (error) {
            errorLog({ message: 'Error in logout:', error })
            res.status(500).json({ error: 'Logout failed' })
        }
    })

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
                    avatar: sessionData.user.avatar,
                },
            })
        } catch (error) {
            errorLog({ message: 'Error checking auth status:', error })
            res.json({ authenticated: false })
        }
    })

    app.get('/api/auth/user', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Not authenticated' })
            }

            res.json({
                id: req.user.id,
                username: req.user.username,
                discriminator: req.user.discriminator,
                avatar: req.user.avatar,
            })
        } catch (error) {
            errorLog({ message: 'Error fetching user:', error })
            res.status(500).json({ error: 'Internal server error' })
        }
    })
}
