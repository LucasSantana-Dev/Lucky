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

export function setupRolesRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/reaction-roles',
        requireAuth,
        requireGuildModuleAccess('overview', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId } = req.params as ReturnType<typeof s.guildIdParam.parse>
            const messages = await reactionRolesService.listReactionRoleMessages(guildId) as unknown
            res.json({ messages })
        }),
    )

    app.get(
        '/api/guilds/:guildId/roles/exclusive',
        requireAuth,
        requireGuildModuleAccess('overview', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId } = req.params as ReturnType<typeof s.guildIdParam.parse>
            const exclusions = await roleManagementService.listExclusiveRoles(guildId) as unknown
            res.json({ exclusions })
        }),
    )
}
