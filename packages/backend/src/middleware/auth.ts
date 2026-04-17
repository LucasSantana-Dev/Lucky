import type { Request, Response, NextFunction } from 'express'
import { sessionService } from '../services/SessionService'
import { errorLog } from '@lucky/shared/utils'

export interface AuthenticatedRequest extends Request {
    sessionId?: string
    userId?: string
    guildContext?: {
        guildId: string
        owner: boolean
        isAdmin: boolean
        effectiveAccess: Record<string, 'none' | 'view' | 'manage'>
        roleIds: string[]
        nickname: string | null
        canManageRbac: boolean
    }
    user?: {
        id: string
        username: string
        discriminator: string
        globalName?: string | null
        avatar: string | null
    }
}

export async function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const sessionId = req.sessionID

    if (!sessionId) {
        res.status(401).json({ error: 'Not authenticated' })
        return
    }

    try {
        const sessionData = await sessionService.getSession(sessionId)
        if (!sessionData) {
            res.status(401).json({ error: 'Session expired or invalid' })
            return
        }

        req.sessionId = sessionId
        req.userId = sessionData.userId
        req.user = {
            id: sessionData.user.id,
            username: sessionData.user.username,
            discriminator: sessionData.user.discriminator,
            globalName: sessionData.user.global_name,
            avatar: sessionData.user.avatar,
        }

        next()
    } catch (error) {
        errorLog({ message: 'Error validating session:', error })
        res.status(500).json({ error: 'Internal server error' })
    }
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
        .then((sessionData) => {
            if (sessionData) {
                req.sessionId = sessionId
                req.userId = sessionData.userId
                req.user = {
                    id: sessionData.user.id,
                    username: sessionData.user.username,
                    discriminator: sessionData.user.discriminator,
                    globalName: sessionData.user.global_name,
                    avatar: sessionData.user.avatar,
                }
            }

            next()
        })
        .catch(() => {
            next()
        })
}
