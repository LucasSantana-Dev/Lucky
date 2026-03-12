import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { sessionService } from '../services/SessionService'
import { guildService } from '../services/GuildService'
import { guildAccessService } from '../services/GuildAccessService'

function getGuildId(req: AuthenticatedRequest): string {
    return typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
}

async function getSessionData(req: AuthenticatedRequest) {
    const sessionId = req.sessionId
    if (!sessionId) {
        throw AppError.unauthorized()
    }

    const sessionData = await sessionService.getSession(sessionId)
    if (!sessionData) {
        throw AppError.unauthorized('Session expired')
    }

    return sessionData
}

function getStatusCode(error: unknown): number | null {
    if (typeof error !== 'object' || error === null) {
        return null
    }

    const errorObject = error as { statusCode?: unknown; status?: unknown }
    if (typeof errorObject.statusCode === 'number') {
        return errorObject.statusCode
    }

    if (typeof errorObject.status === 'number') {
        return errorObject.status
    }

    return null
}

function mapGuildAccessError(error: unknown): Error {
    if (error instanceof AppError) {
        return error
    }

    const statusCode = getStatusCode(error)

    if (statusCode === 401) {
        return AppError.unauthorized(
            'Discord session expired. Please sign in again.',
        )
    }

    if (statusCode === 403) {
        return AppError.forbidden(
            'Discord OAuth scope is missing. Re-authenticate and try again.',
        )
    }

    if (statusCode === 429 || (statusCode !== null && statusCode >= 500)) {
        return new AppError(502, 'Discord API is temporarily unavailable.')
    }

    return error instanceof Error
        ? error
        : new Error('Internal server error')
}

async function runGuildAccessOperation<T>(
    operation: () => Promise<T>,
): Promise<T> {
    try {
        return await operation()
    } catch (error) {
        throw mapGuildAccessError(error)
    }
}

export function setupGuildRoutes(app: Express): void {
    app.get(
        '/api/guilds',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const sessionData = await getSessionData(req)
            const guilds = await runGuildAccessOperation(() =>
                guildAccessService.listAuthorizedGuilds(sessionData),
            )

            res.json({ guilds })
        }),
    )

    app.get(
        '/api/guilds/:id',
        requireAuth,
        requireGuildModuleAccess('overview'),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const id = getGuildId(req)
            const sessionData = await getSessionData(req)

            const guilds = await runGuildAccessOperation(() =>
                guildAccessService.listAuthorizedGuilds(sessionData),
            )
            const guildDetails = guilds.find((guild) => guild.id === id)

            if (!guildDetails) {
                throw AppError.notFound('Guild not found')
            }

            res.json(guildDetails)
        }),
    )

    app.get(
        '/api/guilds/:id/invite',
        requireAuth,
        requireGuildModuleAccess('overview'),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const id = getGuildId(req)
            const inviteUrl = guildService.generateBotInviteUrl(id)

            res.json({ inviteUrl })
        }),
    )

    app.get(
        '/api/guilds/:id/me',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const id = getGuildId(req)
            const sessionData = await getSessionData(req)

            const guildContext =
                req.guildContext ??
                (await runGuildAccessOperation(() =>
                    guildAccessService.resolveGuildContext(sessionData, id),
                ))
            if (!guildContext) {
                throw AppError.forbidden('No access to this server')
            }

            res.json({
                guildId: id,
                nickname: guildContext.nickname,
                username: sessionData.user.username,
                globalName: sessionData.user.global_name ?? null,
                roleIds: guildContext.roleIds,
                effectiveAccess: guildContext.effectiveAccess,
                canManageRbac: guildContext.canManageRbac,
            })
        }),
    )
}
