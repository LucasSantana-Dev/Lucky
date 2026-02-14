import type { Express, Response } from 'express'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { /* embedBuilderService, */ serverLogService } from '@lukbot/shared/services'

function param(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupEmbedRoutes(app: Express): void {
    // TODO: Implement EmbedBuilderService before enabling these routes
    // All routes disabled until service is implemented

    /* DISABLED - EmbedBuilderService not implemented yet
    app.get(
        '/api/guilds/:guildId/embeds',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const templates =
                    await embedBuilderService.listTemplates(guildId)
                res.json({ templates })
            } catch (error) {
                errorLog({ message: 'Error fetching embed templates:', error })
                res.status(500).json({
                    error: 'Failed to fetch embed templates',
                })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/embeds',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { name, embedData, description } = req.body
                if (!name || !embedData)
                    return res
                        .status(400)
                        .json({ error: 'Name and embedData are required' })
                const validation =
                    embedBuilderService.validateEmbedData(embedData)
                if (!validation.valid)
                    return res.status(400).json({
                        error: 'Invalid embed data',
                        details: validation.errors,
                    })
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
            } catch (error) {
                errorLog({ message: 'Error creating embed template:', error })
                res.status(500).json({
                    error: 'Failed to create embed template',
                })
            }
        },
    )

    app.patch(
        '/api/guilds/:guildId/embeds/:name',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const name = param(req.params.name)
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
            } catch (error) {
                errorLog({ message: 'Error updating embed template:', error })
                res.status(500).json({
                    error: 'Failed to update embed template',
                })
            }
        },
    )

    app.delete(
        '/api/guilds/:guildId/embeds/:name',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const name = param(req.params.name)
                await embedBuilderService.deleteTemplate(guildId, name)
                await serverLogService.logEmbedTemplateChange(
                    guildId,
                    'deleted',
                    { templateName: name },
                    req.userId!,
                )
                res.json({ success: true })
            } catch (error) {
                errorLog({ message: 'Error deleting embed template:', error })
                res.status(500).json({
                    error: 'Failed to delete embed template',
                })
            }
        },
    )
    */
}
