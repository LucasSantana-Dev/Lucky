import type { Express, Response } from 'express'
import { z } from 'zod'
import {
    RBAC_MODULES,
    guildRoleAccessService,
    type AccessMode,
    type ModuleKey,
} from '@lucky/shared/services'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { managementSchemas as s } from '../schemas/management'
import { guildService } from '../services/GuildService'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const roleGrantSchema = z
    .object({
        roleId: z.string().regex(/^\d{17,20}$/, 'Invalid role ID'),
        module: z.enum(RBAC_MODULES),
        mode: z.enum(['view', 'manage']),
    })
    .strict()

const rbacUpdateSchema = z
    .object({
        grants: z.array(roleGrantSchema).max(1000),
    })
    .strict()

export function setupRbacRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/rbac',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)

            if (!req.guildContext?.canManageRbac) {
                throw AppError.forbidden(
                    'RBAC can only be managed by server administrators',
                )
            }

            const [grants, roles] = await Promise.all([
                guildRoleAccessService.listRoleGrants(guildId),
                guildService.getGuildRoleOptions(guildId),
            ])

            res.json({
                guildId,
                modules: RBAC_MODULES,
                grants: grants.map((grant) => ({
                    roleId: grant.roleId,
                    module: grant.module,
                    mode: grant.mode,
                })),
                roles,
                effectiveAccess: req.guildContext.effectiveAccess,
                canManageRbac: req.guildContext.canManageRbac,
            })
        }),
    )

    app.put(
        '/api/guilds/:guildId/rbac',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(rbacUpdateSchema),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)

            if (!req.guildContext?.canManageRbac) {
                throw AppError.forbidden(
                    'RBAC can only be managed by server administrators',
                )
            }

            const body = rbacUpdateSchema.parse(req.body)
            const grants = body.grants.map((grant) => ({
                roleId: grant.roleId,
                module: grant.module as ModuleKey,
                mode: grant.mode as AccessMode,
            }))

            const updated = await guildRoleAccessService.replaceRoleGrants(
                guildId,
                grants,
            )

            res.json({
                success: true,
                grants: updated.map((grant) => ({
                    roleId: grant.roleId,
                    module: grant.module,
                    mode: grant.mode,
                })),
            })
        }),
    )
}
