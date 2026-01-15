import type { Express, Request, Response } from 'express'
import { debugLog, errorLog } from '../../utils/general/log'
import { discordOAuthService } from '../services/DiscordOAuthService'
import { sessionService } from '../services/SessionService'
import { oauthStateService } from '../services/OAuthStateService'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'

const getFrontendUrl = (): string => {
    return process.env.WEBAPP_FRONTEND_URL ?? 'http://localhost:5173'
}

export function setupAuthRoutes(app: Express): void {
    app.get('/api/auth/discord', async (_req: Request, res: Response) => {
        try {
            const clientId = process.env.CLIENT_ID
            const redirectUri =
                process.env.WEBAPP_REDIRECT_URI ??
                'http://localhost:3000/api/auth/callback'
            const scope = 'identify guilds'

            if (!clientId) {
                return res
                    .status(500)
                    .json({ error: 'Discord client ID not configured' })
            }

            const state = oauthStateService.generateState()
            await oauthStateService.storeState(state)

            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`

            res.redirect(authUrl)
        } catch (error) {
            errorLog({ message: 'Error in Discord OAuth redirect:', error })
            const frontendUrl = getFrontendUrl()
            res.redirect(
                `${frontendUrl}/?error=auth_failed&message=redirect_error`,
            )
        }
    })

    app.get('/api/auth/callback', async (req: Request, res: Response) => {
        try {
            const { code, state, error } = req.query

            if (error) {
                errorLog({ message: 'Discord OAuth error', data: { error } })
                const frontendUrl = getFrontendUrl()
                return res.redirect(
                    `${frontendUrl}/?error=auth_failed&message=${encodeURIComponent(String(error))}`,
                )
            }

            if (!code || typeof code !== 'string') {
                const frontendUrl = getFrontendUrl()
                return res.redirect(`${frontendUrl}/?error=missing_code`)
            }

            if (!state || typeof state !== 'string') {
                const frontendUrl = getFrontendUrl()
                return res.redirect(`${frontendUrl}/?error=missing_state`)
            }

            const isValidState = await oauthStateService.validateState(state)
            if (!isValidState) {
                errorLog({
                    message: 'Invalid OAuth state parameter',
                    data: { state: state.substring(0, 8) },
                })
                const frontendUrl = getFrontendUrl()
                return res.redirect(`${frontendUrl}/?error=invalid_state`)
            }

            debugLog({
                message: 'Discord OAuth callback received',
                data: { code: code.substring(0, 10) },
            })

            const tokenData =
                await discordOAuthService.exchangeCodeForToken(code)
            const userInfo = await discordOAuthService.getUserInfo(
                tokenData.access_token,
            )

            const sessionId = req.sessionID

            if (!sessionId) {
                const frontendUrl = getFrontendUrl()
                return res.redirect(`${frontendUrl}/?error=session_failed`)
            }

            const expiresAt = Date.now() + tokenData.expires_in * 1000

            await sessionService.setSession(sessionId, {
                userId: userInfo.id,
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                user: userInfo,
                expiresAt,
            })

            debugLog({
                message: 'User authenticated successfully',
                data: { userId: userInfo.id },
            })

            const frontendUrl = getFrontendUrl()
            res.redirect(`${frontendUrl}/?authenticated=true`)
        } catch (error) {
            errorLog({ message: 'Error in Discord OAuth callback:', error })
            const frontendUrl = getFrontendUrl()
            res.redirect(
                `${frontendUrl}/?error=auth_failed&message=authentication_error`,
            )
        }
    })

    app.get(
        '/api/auth/logout',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
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
            } catch (error) {
                errorLog({ message: 'Error in logout:', error })
                res.status(500).json({ error: 'Logout failed' })
            }
        },
    )

    app.get('/api/auth/status', async (req: Request, res: Response) => {
        try {
            const sessionId = req.sessionID

            if (!sessionId) {
                return res.json({ authenticated: false })
            }

            const sessionData = await sessionService.getSession(sessionId)

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

    app.get(
        '/api/auth/user',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
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
        },
    )
}
