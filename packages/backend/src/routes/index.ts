import type { Express } from 'express'
import { setupAuthRoutes } from './auth'
import { setupToggleRoutes } from './toggles'
import { setupGuildRoutes } from './guilds'
import { setupManagementRoutes } from './management'
import { setupModerationRoutes } from './moderation'
import { setupLastFmRoutes } from './lastfm'
import { apiLimiter } from '../middleware/rateLimit'
import { errorHandler } from '../middleware/errorHandler'

export function setupRoutes(app: Express): void {
    app.use('/api/', apiLimiter)
    setupAuthRoutes(app)
    setupToggleRoutes(app)
    setupGuildRoutes(app)
    setupManagementRoutes(app)
    setupModerationRoutes(app)
    setupLastFmRoutes(app)

    app.use(errorHandler)
}
