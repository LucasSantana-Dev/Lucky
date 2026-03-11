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
            if (!req.sessionId) {
                throw AppError.unauthorized()
            }

            const sessionData = await sessionService.getSession(req.sessionId)
            if (!sessionData) {
                throw AppError.unauthorized('Session expired')
            }

            const guildId = getGuildId(req)
            if (!guildId) {
                throw AppError.badRequest('Guild id is required')
            }

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
            next()
        } catch (error) {
            next(error)
        }
    }
}
