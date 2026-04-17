import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { validateParams } from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import {
    reactionRolesService,
    roleManagementService,
} from '@lucky/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupRolesRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/reaction-roles',
        requireAuth,
        requireGuildModuleAccess('overview', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const messages =
                await reactionRolesService.listReactionRoleMessages(guildId)
            res.json({ messages })
        }),
    )

    app.get(
        '/api/guilds/:guildId/roles/exclusive',
        requireAuth,
        requireGuildModuleAccess('overview', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const exclusions =
                await roleManagementService.listExclusiveRoles(guildId)
            res.json({ exclusions })
        }),
    )
}
