import type { Express, Response, NextFunction } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { validateParams, validateBody } from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { managementSchemas as s } from '../schemas/management'
import { writeLimiter } from '../middleware/rateLimit'
import {
    reactionRolesService,
    roleManagementService,
} from '@lucky/shared/services'
import { guildService } from '../services/GuildService'
import multer from 'multer'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

// File upload middleware for reaction roles images
const imageUpload = multer({
    storage: multer.memoryStorage(),
    // Bound every multipart dimension, not just the file, so a malformed/hostile
    // request can't exhaust memory (DoS): one 8MB image + the small JSON payload.
    limits: {
        fileSize: 8 * 1024 * 1024, // 8MB per file
        files: 1,
        fields: 20,
        fieldSize: 256 * 1024, // the `payload` JSON field
        parts: 25,
    },
    fileFilter: (req, file, cb) => {
        const validMimetypes = [
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
        ]
        if (validMimetypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(
                new Error(
                    'Invalid image file type. Only PNG, JPEG, GIF, and WebP are allowed',
                ),
            )
        }
    },
})

// Wrapper to handle multer errors
const handleImageUpload = imageUpload.single('image')
const imageUploadHandler = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
) => {
    handleImageUpload(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return next(
                    AppError.payloadTooLarge('File size exceeds 8MB limit'),
                )
            }
            return next(AppError.badRequest(err.message))
        } else if (err) {
            return next(
                AppError.badRequest(
                    err instanceof Error ? err.message : 'Image upload failed',
                ),
            )
        }
        next()
    })
}

// Parse the reaction-role payload from either a JSON body or the `payload`
// field of a multipart (file-upload) request.
function parseReactionRolePayload(req: AuthenticatedRequest): unknown {
    if (req.is('multipart/form-data')) {
        const raw = (req.body as Record<string, unknown>).payload
        if (typeof raw !== 'string') {
            throw AppError.badRequest(
                'Missing payload field in multipart request',
            )
        }
        try {
            return JSON.parse(raw) as unknown
        } catch {
            throw AppError.badRequest('Invalid JSON in payload field')
        }
    }
    return req.body
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

    app.post(
        '/api/guilds/:guildId/reaction-roles',
        requireAuth,
        requireGuildModuleAccess('overview', 'manage'),
        validateParams(s.guildIdParam),
        imageUploadHandler,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const botToken = process.env.DISCORD_TOKEN?.trim()
            if (!botToken) {
                throw AppError.serviceUnavailable('Bot token not configured')
            }

            const payload = parseReactionRolePayload(req)

            // Validate parsed payload with schema
            const validationResult = s.createReactionRoleBody.safeParse(payload)
            if (!validationResult.success) {
                const errors = validationResult.error.flatten()
                throw AppError.badRequest(
                    `Validation failed: ${JSON.stringify(errors)}`,
                )
            }

            const { channelId, title, description, imageUrl, roles } =
                validationResult.data

            const imageFile = req.file
                ? {
                      buffer: req.file.buffer,
                      filename: req.file.originalname,
                      contentType: req.file.mimetype,
                  }
                : undefined

            const result =
                await reactionRolesService.createReactionRoleMessageFromDashboard(
                    {
                        guildId,
                        channelId,
                        title,
                        description,
                        imageUrl,
                        imageFile,
                        botToken,
                        roles,
                    },
                )
            res.status(201).json(result)
        }),
    )

    app.put(
        '/api/guilds/:guildId/reaction-roles/:messageId',
        requireAuth,
        writeLimiter,
        requireGuildModuleAccess('overview', 'manage'),
        validateParams(s.messageIdParam),
        imageUploadHandler,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const messageId = p(req.params.messageId)
            const botToken = process.env.DISCORD_TOKEN?.trim()
            if (!botToken) {
                throw AppError.serviceUnavailable('Bot token not configured')
            }

            const payload = parseReactionRolePayload(req)

            // Validate parsed payload with schema
            const validationResult = s.updateReactionRoleBody.safeParse(payload)
            if (!validationResult.success) {
                const errors = validationResult.error.flatten()
                throw AppError.badRequest(
                    `Validation failed: ${JSON.stringify(errors)}`,
                )
            }

            const { title, description, imageUrl, roles } =
                validationResult.data

            const imageFile = req.file
                ? {
                      buffer: req.file.buffer,
                      filename: req.file.originalname,
                      contentType: req.file.mimetype,
                  }
                : undefined

            try {
                const result =
                    await reactionRolesService.updateReactionRoleMessage({
                        guildId,
                        messageId,
                        title,
                        description,
                        imageUrl,
                        imageFile,
                        botToken,
                        roles,
                    })
                res.json(result)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'Unknown error'
                if (message === 'Reaction role message not found') {
                    throw AppError.notFound('Reaction role message not found')
                }
                if (message.startsWith('Discord API error')) {
                    throw AppError.badGateway(message)
                }
                throw AppError.badRequest(message)
            }
        }),
    )

    app.delete(
        '/api/guilds/:guildId/reaction-roles/:messageId',
        requireAuth,
        requireGuildModuleAccess('overview', 'manage'),
        validateParams(s.messageIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const messageId = p(req.params.messageId)
            let deleted: boolean
            try {
                deleted =
                    await reactionRolesService.deleteReactionRoleMessage(
                        messageId,
                        guildId,
                    )
            } catch {
                throw new AppError(
                    500,
                    'Failed to delete reaction role message',
                )
            }
            if (!deleted) {
                throw AppError.notFound('Reaction role message not found')
            }
            res.json({ success: true })
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
                if (
                    message.startsWith('Discord API error') ||
                    message === 'No bot token available'
                ) {
                    throw AppError.badGateway(message)
                }
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
                if (
                    message.startsWith('Discord API error') ||
                    message === 'No bot token available'
                ) {
                    throw AppError.badGateway(message)
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
                if (
                    message.startsWith('Discord API error') ||
                    message === 'No bot token available'
                ) {
                    throw AppError.badGateway(message)
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

            const results = await Promise.allSettled(
                roleIds.map(id => guildService.deleteGuildRole(guildId, id)),
            )

            const deleted: string[] = []
            const failed: string[] = []
            results.forEach((result, index) => {
                const roleId = roleIds[index]
                if (result.status === 'fulfilled') {
                    deleted.push(roleId)
                } else {
                    failed.push(roleId)
                }
            })

            res.json({ deleted, failed })
        }),
    )
}
