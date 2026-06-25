import type { NextFunction, Request, Response } from 'express'
import type { AccessMode, ModuleKey } from '@lucky/shared/services'
import { AppError } from '../errors/AppError'
import { sessionService } from '../services/SessionService'
import { guildAccessService } from '../services/GuildAccessService'
import type { AuthenticatedRequest } from './auth'

type RequiredMode = AccessMode | 'auto'

function getGuildId(req: Request): string | null {
    const guildId = req.params.guildId
    if (typeof guildId === 'string' && guildId.length > 0) {
        return guildId
    }

    const id = req.params.id
    if (typeof id === 'string' && id.length > 0) {
        return id
    }

    return null
}

function resolveRequiredMode(req: Request, mode: RequiredMode): AccessMode {
    if (mode !== 'auto') {
        return mode
    }

    return req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'manage'
}

export function requireGuildModuleAccess(
    module: ModuleKey,
    mode: RequiredMode = 'auto',
) {
    return async (
        req: AuthenticatedRequest,
        _res: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            const sessionId = req.sessionId ?? req.sessionID
            if (!sessionId) {
                throw AppError.unauthorized()
            }

            const sessionData = await sessionService.getSession(sessionId)
            if (!sessionData) {
                throw AppError.unauthorized('Session expired')
            }

            const guildId = getGuildId(req)
            if (!guildId) {
                throw AppError.badRequest('Guild id is required')
            }

            // Note: resolveGuildContext uses a 30-second TTL cache on the user's
            // Discord guild list. A membership revocation between getSession() and
            // resolveGuildContext() may transiently grant access until the cache
            // expires. This staleness window is bounded to ≤30s and is acceptable
            // given the operational complexity of tightening the window would incur
            // (atomic resolution would require either a single Discord API call for
            // both user + guild context, or wrapping both in a transaction-like
            // pattern). The cache was intentionally added to prevent Discord API
            // 429 storms when it was unhealthy; see GuildAccessService.ts:38-48.
            const context = await guildAccessService.resolveGuildContext(
                sessionData,
                guildId,
            )
            if (!context) {
                throw AppError.forbidden('No access to this server')
            }

            const requiredMode = resolveRequiredMode(req, mode)
            if (!guildAccessService.hasAccess(context, module, requiredMode)) {
                throw AppError.forbidden(
                    `Requires ${requiredMode} access to ${module}`,
                )
            }

            req.guildContext = context
            req.sessionId = req.sessionId ?? req.sessionID
            req.userId = sessionData.userId
            next()
        } catch (error) {
            next(error)
        }
    }
}
