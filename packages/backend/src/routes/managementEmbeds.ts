import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { embedSchemas as s } from '../schemas/embeds'
import { embedBuilderService, serverLogService } from '@nexus/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupEmbedRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/embeds',
        requireAuth,
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
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.createEmbedBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { name, embedData, description } = req.body
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
                req.userId,
            )
            await serverLogService.logEmbedTemplateChange(
                guildId,
                'created',
                { templateName: name },
                req.userId!,
            )
            res.status(201).json(template)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/embeds/:name',
        requireAuth,
        writeLimiter,
        validateParams(s.embedNameParam),
        validateBody(s.updateEmbedBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const name = p(req.params.name)
            const template = await embedBuilderService.updateTemplate(
                guildId,
                name,
                req.body,
            )
            await serverLogService.logEmbedTemplateChange(
                guildId,
                'updated',
                { templateName: name },
                req.userId!,
            )
            res.json(template)
        }),
    )

    app.delete(
        '/api/guilds/:guildId/embeds/:name',
        requireAuth,
        writeLimiter,
        validateParams(s.embedNameParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const name = p(req.params.name)
            await embedBuilderService.deleteTemplate(guildId, name)
            await serverLogService.logEmbedTemplateChange(
                guildId,
                'deleted',
                { templateName: name },
                req.userId!,
            )
            res.json({ success: true })
        }),
    )
}
