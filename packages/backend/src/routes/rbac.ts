import type { Express, Response } from 'express'
import { z } from 'zod'
import {
    GuildRoleGrantStorageError,
    RBAC_MODULES,
    guildRoleAccessService,
    type AccessMode,
    type RoleGrant,
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

function mapRbacStorageError(error: unknown): never {
    if (error instanceof GuildRoleGrantStorageError) {
        throw new AppError(
            503,
            'RBAC storage is unavailable. Run database migrations and retry.',
        )
    }

    throw error
}

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

            let grants: RoleGrant[]
            let roles: Awaited<ReturnType<typeof guildService.getGuildRoleOptions>>
            try {
                ;[grants, roles] = await Promise.all([
                    guildRoleAccessService.listRoleGrants(guildId),
                    guildService.getGuildRoleOptions(guildId),
                ])
            } catch (error) {
                mapRbacStorageError(error)
            }

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

            let updated: RoleGrant[]
            try {
                updated = await guildRoleAccessService.replaceRoleGrants(
                    guildId,
                    grants,
                )
            } catch (error) {
                mapRbacStorageError(error)
            }

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
