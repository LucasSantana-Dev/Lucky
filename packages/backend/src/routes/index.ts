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
import { setupRbacRoutes } from './rbac'
import { apiLimiter } from '../middleware/rateLimit'
import { requireAuth } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { errorHandler } from '../middleware/errorHandler'
import { setupHealthRoutes } from './health'

export function setupRoutes(app: Express): void {
    setupHealthRoutes(app)
    app.use('/api/', apiLimiter)
    app.use(
        '/api/guilds/:guildId/moderation',
        requireAuth,
        requireGuildModuleAccess('moderation'),
    )
    app.use(
        '/api/guilds/:guildId/automod',
        requireAuth,
        requireGuildModuleAccess('moderation'),
    )
    app.use(
        '/api/guilds/:guildId/logs',
        requireAuth,
        requireGuildModuleAccess('moderation'),
    )
    app.use(
        '/api/guilds/:guildId/commands',
        requireAuth,
        requireGuildModuleAccess('automation'),
    )
    app.use(
        '/api/guilds/:guildId/automessages',
        requireAuth,
        requireGuildModuleAccess('automation'),
    )
    app.use(
        '/api/guilds/:guildId/embeds',
        requireAuth,
        requireGuildModuleAccess('automation'),
    )
    app.use(
        '/api/guilds/:guildId/reaction-roles',
        requireAuth,
        requireGuildModuleAccess('automation'),
    )
    app.use(
        '/api/guilds/:guildId/roles',
        requireAuth,
        requireGuildModuleAccess('automation'),
    )
    app.use(
        '/api/guilds/:guildId/music',
        requireAuth,
        requireGuildModuleAccess('music'),
    )
    app.use(
        '/api/guilds/:guildId/twitch',
        requireAuth,
        requireGuildModuleAccess('integrations'),
    )
    app.use(
        '/api/guilds/:guildId/settings',
        requireAuth,
        requireGuildModuleAccess('settings'),
    )
    app.use(
        '/api/guilds/:guildId/modules',
        requireAuth,
        requireGuildModuleAccess('settings'),
    )
    app.use(
        '/api/guilds/:guildId/rbac',
        requireAuth,
        requireGuildModuleAccess('settings', 'manage'),
    )
    app.use(
        '/api/guilds/:id/features',
        requireAuth,
        requireGuildModuleAccess('settings'),
    )
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
    setupRbacRoutes(app)

    app.use(errorHandler)
}
