import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { embedSchemas as s } from '../schemas/embeds'
import {
    embedBuilderService,
    serverLogService,
    type EmbedData,
} from '@lucky/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupEmbedRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/embeds',
        requireAuth,
        requireGuildModuleAccess('automation', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const templates = await embedBuilderService.listTemplates(
                p(req.params.guildId),
            )
            res.json({ templates })
        }),
    )

    app.post(
        '/api/guilds/:guildId/embeds',
        requireAuth,
        requireGuildModuleAccess('automation', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.createEmbedBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.createEmbedBody.parse(req.body)
            const { name, description } = body
            const embedData = body.embedData as unknown as Partial<EmbedData>
            const validation = embedBuilderService.validateEmbedData(embedData)
            if (!validation.valid) {
                throw AppError.badRequest(
                    'Invalid embed data',
                    validation.errors,
                )
            }
            const template = await embedBuilderService.createTemplate(
                guildId,
                name,
                embedData,
                description,
                userId,
            )
            await serverLogService.logEmbedTemplateChange(
                guildId,
                'created',
                { templateName: name },
                userId,
            )
            res.status(201).json(template)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/embeds/:name',
        requireAuth,
        requireGuildModuleAccess('automation', 'manage'),
        writeLimiter,
        validateParams(s.embedNameParam),
        validateBody(s.updateEmbedBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const name = p(req.params.name)
            const body = s.updateEmbedBody.parse(req.body)
            const updates = body as unknown as Partial<
                EmbedData & { description: string }
            >
            const template = await embedBuilderService.updateTemplate(
                guildId,
                name,
                updates,
            )
            await serverLogService.logEmbedTemplateChange(
                guildId,
                'updated',
                { templateName: name },
                userId,
            )
            res.json(template)
        }),
    )

    app.delete(
        '/api/guilds/:guildId/embeds/:name',
        requireAuth,
        requireGuildModuleAccess('automation', 'manage'),
        writeLimiter,
        validateParams(s.embedNameParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const name = p(req.params.name)
            await embedBuilderService.deleteTemplate(guildId, name)
            await serverLogService.logEmbedTemplateChange(
                guildId,
                'deleted',
                { templateName: name },
                userId,
            )
            res.json({ success: true })
        }),
    )
}
