import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { moderationSchemas as s } from '../schemas/moderation'
import { moderationService, serverLogService } from '@lucky/shared/services'
import { paramToString as p } from '../utils/paramCoerce'
import { guildService } from '../services/GuildService'
import { errorLog } from '@lucky/shared/utils'

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

type SettingsIds = {
    modLogChannelId?: string | null
    muteRoleId?: string | null
    modRoleIds?: string[]
}

// Discord lookups swallow API failures and return []. For ids we must verify,
// an empty list is therefore "could not verify", never "nothing matches".
async function lookupGuildIds<T extends { id: string }>(
    fetchOptions: () => Promise<T[]>,
    label: string,
): Promise<Set<string>> {
    let options: T[]
    try {
        options = await fetchOptions()
    } catch (error) {
        errorLog({ message: `Failed to look up guild ${label}`, error })
        throw AppError.badGateway(`Unable to verify guild ${label} right now`)
    }
    if (options.length === 0) {
        throw AppError.serviceUnavailable(
            `Unable to verify guild ${label} right now`,
        )
    }
    return new Set(options.map((o) => o.id))
}

// The dashboard manager is delegated, so the ids must belong to this guild
// (#2600). The guild id doubles as the @everyone role id and would make every
// member a moderator via hasModPermissions.
async function assertSettingsIdsBelongToGuild(
    guildId: string,
    body: SettingsIds,
): Promise<void> {
    const roleIds = [body.muteRoleId, ...(body.modRoleIds ?? [])].filter(
        (id): id is string => typeof id === 'string',
    )
    if (roleIds.includes(guildId)) {
        throw AppError.badRequest('Invalid role for this server')
    }
    const needsRoles = roleIds.length > 0
    const needsChannel = Boolean(body.modLogChannelId)
    const [knownRoles, knownChannels] = await Promise.all([
        needsRoles
            ? lookupGuildIds(
                  () => guildService.getFullGuildRoles(guildId),
                  'roles',
              )
            : undefined,
        needsChannel
            ? lookupGuildIds(
                  () => guildService.getGuildTextChannelOptions(guildId),
                  'channels',
              )
            : undefined,
    ])
    if (knownRoles && roleIds.some((id) => !knownRoles.has(id))) {
        throw AppError.badRequest('Invalid role for this server')
    }
    if (
        knownChannels &&
        body.modLogChannelId &&
        !knownChannels.has(body.modLogChannelId)
    ) {
        throw AppError.badRequest('Invalid text channel for this server')
    }
}

export function setupModerationRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/moderation/cases',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.guildIdParam),
        validateQuery(s.casesQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const query = s.casesQuery.parse(req.query)
            const { cases, total } = await moderationService.getFilteredCases(
                p(req.params.guildId),
                query,
            )
            res.json({ cases, total })
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/cases/:caseNumber',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.caseNumberParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const modCase = await moderationService.getCase(
                p(req.params.guildId),
                Number(req.params.caseNumber),
            )
            if (!modCase) {
                throw AppError.notFound('Case not found')
            }
            res.json(modCase)
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/users/:userId/cases',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.userCasesParam),
        validateQuery(s.userCasesQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const query = s.userCasesQuery.parse(req.query)
            const activeOnly = query.activeOnly === 'true'
            const cases = await moderationService.getUserCases(
                p(req.params.guildId),
                p(req.params.userId),
                activeOnly,
            )
            res.json({ cases })
        }),
    )

    app.patch(
        '/api/guilds/:guildId/moderation/cases/:caseNumber/reason',
        requireAuth,
        requireGuildModuleAccess('moderation', 'manage'),
        writeLimiter,
        validateParams(s.caseNumberParam),
        validateBody(s.updateReasonBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const caseNumber = Number(req.params.caseNumber)
            const { reason } = s.updateReasonBody.parse(req.body)

            const modCase = await moderationService.getCase(guildId, caseNumber)
            if (!modCase) {
                throw AppError.notFound('Case not found')
            }

            await serverLogService.logCaseUpdate(
                guildId,
                {
                    caseNumber,
                    changeType: 'reason_update',
                    oldValue: modCase.reason ?? undefined,
                    newValue: reason,
                },
                userId,
            )
            res.json({ success: true })
        }),
    )

    app.post(
        '/api/guilds/:guildId/moderation/cases/:caseId/deactivate',
        requireAuth,
        requireGuildModuleAccess('moderation', 'manage'),
        writeLimiter,
        validateParams(s.caseIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const caseId = p(req.params.caseId)
            const updated = await moderationService.deactivateCase(caseId)
            await serverLogService.logCaseUpdate(
                guildId,
                {
                    caseNumber: updated.caseNumber,
                    changeType: 'deactivated',
                },
                userId,
            )
            res.json(updated)
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const settings = await moderationService.getSettings(
                p(req.params.guildId),
            )
            res.json({ settings })
        }),
    )

    app.patch(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        requireGuildModuleAccess('moderation', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.updateSettingsBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.updateSettingsBody.parse(req.body)
            await assertSettingsIdsBelongToGuild(guildId, body)
            const settings = await moderationService.updateSettings(
                guildId,
                body,
            )
            await serverLogService.logSettingsChange(
                guildId,
                { setting: 'moderation', newValue: body },
                userId,
            )
            res.json({ settings })
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/stats',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const stats = await moderationService.getStats(
                p(req.params.guildId),
            )
            res.json(stats)
        }),
    )
}
