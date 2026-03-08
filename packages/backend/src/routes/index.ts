import type { Express } from 'express'
import { setupAuthRoutes } from './auth'
import { setupToggleRoutes } from './toggles'
import { setupGuildRoutes } from './guilds'
import { setupManagementRoutes } from './management'
import { setupModerationRoutes } from './moderation'
import { setupLastFmRoutes } from './lastfm'
import { setupGuildSettingsRoutes } from './guildSettings'
import { setupTrackHistoryRoutes } from './trackHistory'
import { setupTwitchRoutes } from './twitch'
import { setupLyricsRoutes } from './lyrics'
import { setupRolesRoutes } from './roles'
import { apiLimiter } from '../middleware/rateLimit'
import { errorHandler } from '../middleware/errorHandler'
import { setupHealthRoutes } from './health'

export function setupRoutes(app: Express): void {
    setupHealthRoutes(app)
    app.use('/api/', apiLimiter)
    setupAuthRoutes(app)
    setupToggleRoutes(app)
    setupGuildRoutes(app)
    setupManagementRoutes(app)
    setupModerationRoutes(app)
    setupLastFmRoutes(app)
    setupGuildSettingsRoutes(app)
    setupTrackHistoryRoutes(app)
    setupTwitchRoutes(app)
    setupLyricsRoutes(app)
    setupRolesRoutes(app)

    app.use(errorHandler)
}
