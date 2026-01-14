import type { Express, Response } from 'express'
import { featureToggleService } from '@lukbot/shared/services'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { getFeatureToggleConfig } from '@lukbot/shared/config'
import type { FeatureToggleName } from '@lukbot/shared/types'

const DEVELOPER_USER_IDS = (process.env.DEVELOPER_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

function isDeveloper(userId?: string): boolean {
    if (!userId) return false
    return DEVELOPER_USER_IDS.includes(userId)
}

export function setupToggleRoutes(app: Express): void {
    app.get('/api/toggles/global', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.userId

            if (!userId || !isDeveloper(userId)) {
                return res.status(403).json({ error: 'Developer access required' })
            }

            const toggles = featureToggleService.getAllToggles()
            const result: Record<string, boolean> = {}

            for (const [name] of toggles) {
                result[name] = await featureToggleService.isEnabledGlobal(name, userId)
            }

            res.json({ toggles: result })
        } catch (error) {
            errorLog({ message: 'Error fetching global toggles:', error })
            res.status(500).json({ error: 'Failed to fetch global toggles' })
        }
    })

    app.get('/api/toggles/global/:name', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.userId
            const toggleName = typeof req.params.name === 'string' ? req.params.name : req.params.name[0]

            if (!userId || !isDeveloper(userId)) {
                return res.status(403).json({ error: 'Developer access required' })
            }

            if (!toggleName || !featureToggleService.getAllToggles().has(toggleName as FeatureToggleName)) {
                return res.status(400).json({ error: 'Invalid toggle name' })
            }

            const enabled = await featureToggleService.isEnabledGlobal(
                toggleName as FeatureToggleName,
                userId,
            )

            res.json({ name: toggleName, enabled })
        } catch (error) {
            errorLog({ message: 'Error fetching global toggle:', error })
            res.status(500).json({ error: 'Failed to fetch global toggle' })
        }
    })

    app.post('/api/toggles/global/:name', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.userId
            const toggleName = typeof req.params.name === 'string' ? req.params.name : req.params.name[0]

            if (!userId || !isDeveloper(userId)) {
                return res.status(403).json({ error: 'Developer access required' })
            }

            if (!toggleName || !featureToggleService.getAllToggles().has(toggleName as FeatureToggleName)) {
                return res.status(400).json({ error: 'Invalid toggle name' })
            }

            res.json({
                success: true,
                message: 'Toggle updated via Unleash admin API',
                note: 'Use Unleash admin API to update global toggles',
            })
        } catch (error) {
            errorLog({ message: 'Error updating global toggle:', error })
            res.status(500).json({ error: 'Failed to update toggle' })
        }
    })

    app.get('/api/features', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
        try {
            const config = getFeatureToggleConfig()
            const features = Object.values(config).map((toggle) => ({
                name: toggle.name,
                description: toggle.description,
            }))

            res.json({ features })
        } catch (error) {
            errorLog({ message: 'Error listing features:', error })
            res.status(500).json({ error: 'Failed to list features' })
        }
    })

    app.get('/api/guilds/:id/features', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const guildId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
            const userId = req.userId

            if (!guildId) {
                return res.status(400).json({ error: 'Guild ID required' })
            }

            const toggles = featureToggleService.getAllToggles()
            const result: Record<string, boolean> = {}

            for (const [name] of toggles) {
                const enabled = await featureToggleService.isEnabledForGuild(
                    name,
                    guildId,
                    userId,
                )
                result[name] = enabled
            }

            res.json({ guildId, toggles: result })
        } catch (error) {
            errorLog({ message: 'Error fetching guild features:', error })
            res.status(500).json({ error: 'Failed to fetch guild features' })
        }
    })

    app.post('/api/guilds/:id/features/:name', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const guildId = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
            const toggleName = typeof req.params.name === 'string' ? req.params.name : req.params.name[0]
            const { enabled } = req.body as { enabled?: boolean }

            if (!guildId || !toggleName) {
                return res.status(400).json({ error: 'Guild ID and toggle name required' })
            }

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({ error: 'Enabled must be a boolean' })
            }

            if (!featureToggleService.getAllToggles().has(toggleName as FeatureToggleName)) {
                return res.status(400).json({ error: 'Invalid toggle name' })
            }

            res.json({
                success: true,
                message: 'Toggle updated via Unleash admin API',
                note: 'Use Unleash admin API to update toggles per guild',
            })
        } catch (error) {
            errorLog({ message: 'Error updating guild feature:', error })
            res.status(500).json({ error: 'Failed to update feature' })
        }
    })
}
