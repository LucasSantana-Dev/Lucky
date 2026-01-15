import type { Request, Response, NextFunction } from 'express'
import { sessionService } from '../services/SessionService'
import { discordOAuthService } from '../services/DiscordOAuthService'
import { errorLog, debugLog } from '../../utils/general/log'

export interface AuthenticatedRequest extends Request {
    sessionId?: string
    userId?: string
    user?: {
        id: string
        username: string
        discriminator: string
        avatar: string | null
    }
}

async function refreshTokenIfNeeded(sessionId: string): Promise<boolean> {
    try {
        const sessionData = await sessionService.getSession(sessionId)
        if (!sessionData) {
            return false
        }

        const now = Date.now()
        const bufferTime = 5 * 60 * 1000

        if (sessionData.expiresAt > now + bufferTime) {
            return true
        }

        if (!sessionData.refreshToken) {
            debugLog({ message: 'No refresh token available, cannot refresh' })
            return false
        }

        debugLog({
            message: 'Access token expired, refreshing...',
            data: { userId: sessionData.userId },
        })

        try {
            const newTokenData = await discordOAuthService.refreshToken(
                sessionData.refreshToken,
            )
            const newExpiresAt = Date.now() + newTokenData.expires_in * 1000

            await sessionService.updateSession(sessionId, {
                accessToken: newTokenData.access_token,
                refreshToken: newTokenData.refresh_token,
                expiresAt: newExpiresAt,
            })

            debugLog({
                message: 'Token refreshed successfully',
                data: { userId: sessionData.userId },
            })
            return true
        } catch (refreshError) {
            errorLog({
                message: 'Token refresh failed, session expired',
                error: refreshError,
            })
            await sessionService.deleteSession(sessionId)
            return false
        }
    } catch (error) {
        errorLog({ message: 'Error checking token expiration:', error })
        return false
    }
}

export function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    const sessionId = req.sessionID

    if (!sessionId) {
        res.status(401).json({ error: 'Not authenticated' })
        return
    }

    sessionService
        .getSession(sessionId)
        .then(async (sessionData) => {
            if (!sessionData) {
                res.status(401).json({ error: 'Session expired or invalid' })
                return
            }

            const tokenValid = await refreshTokenIfNeeded(sessionId)
            if (!tokenValid) {
                res.status(401).json({
                    error: 'Session expired, please login again',
                })
                return
            }

            const updatedSession = await sessionService.getSession(sessionId)
            if (!updatedSession) {
                res.status(401).json({ error: 'Session expired or invalid' })
                return
            }

            req.sessionId = sessionId
            req.userId = updatedSession.userId
            req.user = {
                id: updatedSession.user.id,
                username: updatedSession.user.username,
                discriminator: updatedSession.user.discriminator,
                avatar: updatedSession.user.avatar,
            }

            next()
        })
        .catch((error) => {
            errorLog({ message: 'Error validating session:', error })
            res.status(500).json({ error: 'Internal server error' })
        })
}

export function optionalAuth(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
): void {
    const sessionId = req.sessionID

    if (!sessionId) {
        next()
        return
    }

    sessionService
        .getSession(sessionId)
        .then(async (sessionData) => {
            if (sessionData) {
                await refreshTokenIfNeeded(sessionId)
                const updatedSession =
                    await sessionService.getSession(sessionId)
                if (updatedSession) {
                    req.sessionId = sessionId
                    req.userId = updatedSession.userId
                    req.user = {
                        id: updatedSession.user.id,
                        username: updatedSession.user.username,
                        discriminator: updatedSession.user.discriminator,
                        avatar: updatedSession.user.avatar,
                    }
                }
            }

            next()
        })
        .catch(() => {
            next()
        })
}
