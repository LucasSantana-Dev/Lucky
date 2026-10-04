import type { Express, Response, NextFunction } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateParams, validateBody } from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { managementSchemas as s } from '../schemas/management'
import { writeLimiter } from '../middleware/rateLimit'
import {
    reactionRolesService,
    roleManagementService,
} from '@lucky/shared/services'
import { errorLog, warnLog } from '@lucky/shared/utils'
import { guildService } from '../services/GuildService'
import type { GuildRoleManage } from '../services/RoleService'
import multer from 'multer'
import { paramToString as p } from '../utils/paramCoerce'
import {
    assertCanManageRoles,
    assertRequestedPermissionsWithinGrant,
    assertRoleHierarchyAllowed,
    type RoleGuardContext,
} from './roleEscalationGuard'

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

// /roles/manage/* is only reachable behind the settings:manage guard in
// routes/index.ts, which always populates req.guildContext before these
// handlers run. Failing closed here (rather than assuming it is set) covers
// the case where that invariant is ever broken (#2451).
function requireGuildContext(
    req: AuthenticatedRequest,
): NonNullable<AuthenticatedRequest['guildContext']> {
    if (!req.guildContext) {
        throw AppError.forbidden('Guild access context is required')
    }
    return req.guildContext
}

// GuildAccessService skips the real member lookup (roleIds) for guild
// owners and for the dashboard's broader MANAGE_GUILD-inclusive `isAdmin`,
// since those callers already get full dashboard access - `roleIds` is `[]`
// in that case but that means "never checked", not "holds no roles"
// (botPresenceChecked distinguishes the two). Map that through so the
// hierarchy check can skip rather than wrongly treat them as @everyone.
function toRoleGuardContext(
    guildContext: NonNullable<AuthenticatedRequest['guildContext']>,
): RoleGuardContext {
    return {
        owner: guildContext.owner,
        permissions: guildContext.permissions,
        roleIds: guildContext.roleIds,
        roleDataAvailable: guildContext.botPresenceChecked,
    }
}

// The hierarchy check must not silently pass open for a requester whose
// real Discord roles were never fetched (roleDataAvailable=false): that is
// true for the guild owner (genuinely exempt) but also for the dashboard's
// broader MANAGE_GUILD-inclusive `isAdmin`, who is NOT exempt from Discord's
// hierarchy rule (only the owner is). For everyone else in that state, fetch
// their real roles via the bot before running the check; fail closed (403)
// if that fetch cannot be completed (#2451 review).
async function resolveHierarchyGuardContext(
    req: AuthenticatedRequest,
    guildId: string,
    guildContext: NonNullable<AuthenticatedRequest['guildContext']>,
): Promise<RoleGuardContext> {
    const base = toRoleGuardContext(guildContext)
    if (base.owner || base.roleDataAvailable) {
        return base
    }

    const userId = req.user?.id
    if (!userId) {
        throw AppError.forbidden(
            'Unable to verify role hierarchy right now; please try again',
        )
    }

    try {
        const hasBot = await guildService.hasBotInGuild(guildId)
        if (!hasBot) {
            throw AppError.forbidden(
                'Unable to verify role hierarchy right now; please try again',
            )
        }

        const memberContext = await guildService.getGuildMemberContext(
            guildId,
            userId,
        )
        return {
            ...base,
            roleIds: memberContext.roleIds,
            roleDataAvailable: true,
        }
    } catch (error) {
        if (error instanceof AppError) {
            throw error
        }
        throw AppError.forbidden(
            'Unable to verify role hierarchy right now; please try again',
        )
    }
}

// Discord rejects binding, assigning or editing a role positioned at or above
// the bot's own highest role. Surface that as a clear 400 up front (#2420).
// Skipped when the bot's position cannot be determined; Discord stays the
// source of truth in that case.
async function assertRolesBelowBot(
    guildId: string,
    roleIds: string[],
    knownRoles?: GuildRoleManage[],
): Promise<void> {
    const botHighest = await guildService.getBotHighestRolePosition(guildId)
    if (botHighest === null) {
        warnLog({
            message: `Bot highest role unknown for guild ${guildId}; skipping role hierarchy check`,
        })
        return
    }
    const roles = knownRoles ?? (await guildService.getFullGuildRoles(guildId))
    for (const roleId of roleIds) {
        const role = roles.find((r) => r.id === roleId)
        if (role && role.position >= botHighest) {
            throw AppError.badRequest(
                `Role "${role.name}" is at or above the bot's highest role. Move the bot's role above it in Discord server settings.`,
            )
        }
    }
}

export function setupRolesRoutes(app: Express): void {
    // Guarded by the `/reaction-roles` prefix (automation) in
    // routes/index.ts, no separate module check here (#2409).
    app.get(
        '/api/guilds/:guildId/reaction-roles',
        requireAuth,
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
        writeLimiter,
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

            await assertRolesBelowBot(
                guildId,
                roles.map((r) => r.roleId),
            )

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

            // Roles already bound to this message stay editable even if the
            // bot has since been demoted: only newly added roles are checked.
            const existing =
                await reactionRolesService.listReactionRoleMessages(guildId)
            const alreadyBound = new Set(
                existing
                    .filter((m) => m.messageId === messageId)
                    .flatMap((m) => m.mappings.map((x) => x.roleId)),
            )
            await assertRolesBelowBot(
                guildId,
                roles
                    .map((r) => r.roleId)
                    .filter((id) => !alreadyBound.has(id)),
            )

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
                errorLog({
                    message: 'Failed to update reaction role message',
                    error,
                })
                throw new AppError(
                    500,
                    'Failed to update reaction role message',
                )
            }
        }),
    )

    app.delete(
        '/api/guilds/:guildId/reaction-roles/:messageId',
        requireAuth,
        writeLimiter,
        validateParams(s.messageIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const messageId = p(req.params.messageId)
            let deleted: boolean
            try {
                deleted = await reactionRolesService.deleteReactionRoleMessage(
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

    // Guarded by the `/roles` prefix (automation) in routes/index.ts, no
    // separate module check here (#2409).
    app.get(
        '/api/guilds/:guildId/roles/exclusive',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const exclusions =
                await roleManagementService.listExclusiveRoles(guildId)
            res.json({ exclusions })
        }),
    )

    // /roles/manage/* is guarded entirely by its own `settings:manage`
    // guildGuardConfigs entry in routes/index.ts, separate from the broader
    // `/roles` (automation) prefix, which skips this subtree
    // (isRolesManagePath). No handler-level check is registered here: adding
    // one back would just re-resolve the same session and guild context a
    // second time for every request (cubic review on PR #2449). It must stay
    // `settings`, never `automation`: the POST/PATCH bodies here accept an
    // arbitrary Discord permissions bitfield, so an automation-only caller
    // must not be able to touch this route (#2409, security finding on PR
    // #2449). The guard intentionally requires `manage` even on the GET (the
    // full role list includes hierarchy/permission data).
    app.get(
        '/api/guilds/:guildId/roles/manage',
        requireAuth,
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
        validateParams(s.guildIdParam),
        validateBody(s.roleUpsertBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const data = s.roleUpsertBody.parse(req.body)
            const guildContext = requireGuildContext(req)
            assertCanManageRoles(guildContext)
            assertRequestedPermissionsWithinGrant(
                guildContext,
                data.permissions,
            )

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
        validateParams(s.roleIdParam),
        validateBody(s.roleUpsertBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const roleId = p(req.params.roleId)
            const data = s.roleUpsertBody.parse(req.body)
            const guildContext = requireGuildContext(req)
            assertCanManageRoles(guildContext)
            assertRequestedPermissionsWithinGrant(
                guildContext,
                data.permissions,
            )
            const existingRoles = await guildService.getFullGuildRoles(guildId)
            const hierarchyContext = await resolveHierarchyGuardContext(
                req,
                guildId,
                guildContext,
            )
            assertRoleHierarchyAllowed(hierarchyContext, roleId, existingRoles)
            await assertRolesBelowBot(guildId, [roleId], existingRoles)

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
        validateParams(s.roleIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const roleId = p(req.params.roleId)
            const guildContext = requireGuildContext(req)
            assertCanManageRoles(guildContext)
            const existingRoles = await guildService.getFullGuildRoles(guildId)
            const hierarchyContext = await resolveHierarchyGuardContext(
                req,
                guildId,
                guildContext,
            )
            assertRoleHierarchyAllowed(hierarchyContext, roleId, existingRoles)

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
        validateParams(s.roleIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const roleId = p(req.params.roleId)
            const guildContext = requireGuildContext(req)
            assertCanManageRoles(guildContext)

            try {
                const roles = await guildService.getFullGuildRoles(guildId)
                const sourceRole = roles.find((r) => r.id === roleId)

                if (!sourceRole) {
                    throw AppError.notFound('Source role not found')
                }

                // Duplicating copies the source role's permissions onto a new
                // role: the same escalation vector as a direct grant (#2451).
                assertRequestedPermissionsWithinGrant(
                    guildContext,
                    sourceRole.permissions,
                )

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
        validateParams(s.guildIdParam),
        validateBody(s.bulkDeleteBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { roleIds } = s.bulkDeleteBody.parse(req.body)
            const guildContext = requireGuildContext(req)
            assertCanManageRoles(guildContext)
            const existingRoles = await guildService.getFullGuildRoles(guildId)
            const hierarchyContext = await resolveHierarchyGuardContext(
                req,
                guildId,
                guildContext,
            )
            for (const roleId of roleIds) {
                assertRoleHierarchyAllowed(
                    hierarchyContext,
                    roleId,
                    existingRoles,
                )
            }

            const BATCH_SIZE = 10
            const deleted: string[] = []
            const failed: string[] = []

            for (let i = 0; i < roleIds.length; i += BATCH_SIZE) {
                const batch = roleIds.slice(i, i + BATCH_SIZE)
                const results = await Promise.allSettled(
                    batch.map((id) =>
                        guildService.deleteGuildRole(guildId, id),
                    ),
                )
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        deleted.push(batch[index])
                    } else {
                        failed.push(batch[index])
                    }
                })
            }

            res.json({ deleted, failed })
        }),
    )
}
