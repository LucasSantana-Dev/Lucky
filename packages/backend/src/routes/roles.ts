import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { validateParams, validateBody } from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { writeLimiter } from '../middleware/rateLimit'
import { AppError } from '../errors/AppError'
import {
    reactionRolesService,
    roleManagementService,
} from '@lucky/shared/services'
import { guildService } from '../services/GuildService'

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

    app.get(
        '/api/guilds/:guildId/roles/manage',
        requireAuth,
        requireGuildModuleAccess('settings', 'manage'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const roles = await guildService.getFullGuildRoles(guildId)
            res.json({ roles })
        }),
    )

    app.post(
        '/api/guilds/:guildId/roles/manage',
        requireAuth,
        writeLimiter,
        requireGuildModuleAccess('settings', 'manage'),
        validateParams(s.guildIdParam),
        validateBody(s.roleUpsertBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const data = s.roleUpsertBody.parse(req.body)

            try {
                const role = await guildService.createGuildRole(guildId, data)
                res.status(201).json({ role })
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Failed to create role'
                throw AppError.badRequest(message)
            }
        }),
    )

    app.patch(
        '/api/guilds/:guildId/roles/manage/:roleId',
        requireAuth,
        writeLimiter,
        requireGuildModuleAccess('settings', 'manage'),
        validateParams(s.roleIdParam),
        validateBody(s.roleUpsertBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const roleId = p(req.params.roleId)
            const data = s.roleUpsertBody.parse(req.body)

            try {
                const role = await guildService.updateGuildRole(
                    guildId,
                    roleId,
                    data,
                )
                res.json({ role })
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Failed to update role'
                if (message === 'Role not found') {
                    throw AppError.notFound('Role not found')
                }
                throw AppError.badRequest(message)
            }
        }),
    )

    app.delete(
        '/api/guilds/:guildId/roles/manage/:roleId',
        requireAuth,
        writeLimiter,
        requireGuildModuleAccess('settings', 'manage'),
        validateParams(s.roleIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const roleId = p(req.params.roleId)

            try {
                await guildService.deleteGuildRole(guildId, roleId)
                res.json({ success: true })
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Failed to delete role'
                if (message === 'Role not found') {
                    throw AppError.notFound(message)
                }
                throw AppError.badRequest(message)
            }
        }),
    )

    app.post(
        '/api/guilds/:guildId/roles/manage/:roleId/duplicate',
        requireAuth,
        writeLimiter,
        requireGuildModuleAccess('settings', 'manage'),
        validateParams(s.roleIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const roleId = p(req.params.roleId)

            try {
                const roles = await guildService.getFullGuildRoles(guildId)
                const sourceRole = roles.find((r) => r.id === roleId)

                if (!sourceRole) {
                    throw AppError.notFound('Source role not found')
                }

                const duplicatedRole = await guildService.createGuildRole(
                    guildId,
                    {
                        name: `${sourceRole.name} (copy)`,
                        color: sourceRole.color,
                        hoist: sourceRole.hoist,
                        mentionable: sourceRole.mentionable,
                        permissions: sourceRole.permissions,
                    },
                )

                res.status(201).json({ role: duplicatedRole })
            } catch (error) {
                if (error instanceof AppError) {
                    throw error
                }
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Failed to duplicate role'
                throw AppError.badRequest(message)
            }
        }),
    )

    app.post(
        '/api/guilds/:guildId/roles/manage/bulk-delete',
        requireAuth,
        writeLimiter,
        requireGuildModuleAccess('settings', 'manage'),
        validateParams(s.guildIdParam),
        validateBody(s.bulkDeleteBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { roleIds } = s.bulkDeleteBody.parse(req.body)

            const deleted: string[] = []
            const failed: string[] = []

            for (const roleId of roleIds) {
                try {
                    await guildService.deleteGuildRole(guildId, roleId)
                    deleted.push(roleId)
                } catch (_err) {
                    failed.push(roleId)
                }
            }

            res.json({ deleted, failed })
        }),
    )
}
