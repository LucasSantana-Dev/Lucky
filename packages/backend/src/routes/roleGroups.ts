import type { Express, Response } from 'express'
import type { AuthenticatedRequest } from '../middleware/auth'
import { validateParams, validateBody } from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { managementSchemas as s } from '../schemas/management'
import { writeLimiter } from '../middleware/rateLimit'
import { roleGroupService } from '../services/RoleGroupService'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupRoleGroupsRoutes(app: Express): void {
    app.post(
        '/api/guilds/:guildId/role-groups',
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.createRoleGroupBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const data = s.createRoleGroupBody.parse(req.body)

            try {
                const group = await roleGroupService.createRoleGroup({
                    guildId,
                    name: data.name,
                    fromMessageId: data.fromMessageId,
                    style: data.style,
                })
                res.status(201).json(group)
            } catch (error: unknown) {
                if (error instanceof AppError) {
                    throw error as AppError
                }
                const err =
                    error instanceof Error ? error : new Error(String(error))
                const message = err.message || 'Failed to create role group'
                if (
                    message.includes('not found') ||
                    message.includes('not-found')
                ) {
                    throw AppError.notFound(message)
                }
                if (
                    message.includes('conflict') ||
                    message.includes('already-grouped')
                ) {
                    throw AppError.conflict(message)
                }
                throw AppError.badRequest(message)
            }
        }),
    )

    app.get(
        '/api/guilds/:guildId/role-groups',
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)

            const groups = await roleGroupService.listRoleGroups(guildId)
            res.json({ groups })
        }),
    )

    app.get(
        '/api/guilds/:guildId/role-groups/:id',
        validateParams(s.roleGroupIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const id = p(req.params.id)

            const group = await roleGroupService.getRoleGroup(id, guildId)
            if (!group) {
                throw AppError.notFound('Role group not found')
            }
            res.json(group)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/role-groups/:id',
        writeLimiter,
        validateParams(s.roleGroupIdParam),
        validateBody(s.updateRoleGroupBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const id = p(req.params.id)
            const data = s.updateRoleGroupBody.parse(req.body)

            try {
                const group = await roleGroupService.updateRoleGroup(
                    id,
                    guildId,
                    data,
                )
                if (!group) {
                    throw AppError.notFound('Role group not found')
                }
                res.json(group)
            } catch (error: unknown) {
                if (error instanceof AppError) {
                    throw error as AppError
                }
                const err =
                    error instanceof Error ? error : new Error(String(error))
                const message = err.message || 'Failed to update role group'
                throw AppError.badRequest(message)
            }
        }),
    )

    app.post(
        '/api/guilds/:guildId/role-groups/:id/roles',
        writeLimiter,
        validateParams(s.roleGroupIdParam),
        validateBody(s.addRoleToGroupBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const id = p(req.params.id)
            const botToken = process.env.DISCORD_TOKEN?.trim()
            if (!botToken) {
                throw AppError.serviceUnavailable('Bot token not configured')
            }

            const data = s.addRoleToGroupBody.parse(req.body)

            try {
                const result = await roleGroupService.addRoleToGroup(
                    guildId,
                    id,
                    data,
                    botToken,
                )
                res.json(result)
            } catch (error: unknown) {
                if (error instanceof AppError) {
                    throw error as AppError
                }
                const err =
                    error instanceof Error ? error : new Error(String(error))
                const message = err.message || 'Failed to add role to group'

                // Check for specific error patterns (from tests and RoleGroupService)
                if (
                    message.includes('not found') ||
                    message.includes('not-found')
                ) {
                    throw AppError.notFound(message)
                }
                if (
                    message.includes('25 buttons') ||
                    message.includes('25-buttons') ||
                    message.includes('250 roles') ||
                    message.includes('250-roles') ||
                    message.includes('already mapped') ||
                    message.includes('duplicate-name')
                ) {
                    throw AppError.conflict(message)
                }
                if (message.includes('Label too long')) {
                    throw AppError.badRequest(message)
                }
                throw AppError.badRequest(message)
            }
        }),
    )

    app.delete(
        '/api/guilds/:guildId/role-groups/:id/roles/:roleId',
        writeLimiter,
        validateParams(s.roleGroupRoleIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const id = p(req.params.id)
            const roleId = p(req.params.roleId)

            const success = await roleGroupService.detachRoleFromGroup(
                id,
                roleId,
                guildId,
            )
            if (!success) {
                throw AppError.notFound('Role group or role not found')
            }
            res.json({ success: true })
        }),
    )
}
