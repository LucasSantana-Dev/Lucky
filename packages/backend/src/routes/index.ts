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
import { setupGuildAutomationRoutes } from './guildAutomation'
import { setupLevelsRoutes } from './levels'
import { setupStarboardRoutes } from './starboard'
import { apiLimiter } from '../middleware/rateLimit'
import { requireAuth } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { errorHandler } from '../middleware/errorHandler'
import { setupHealthRoutes } from './health'

type GuildGuardConfig = {
    path: string
    module: Parameters<typeof requireGuildModuleAccess>[0]
    mode?: Parameters<typeof requireGuildModuleAccess>[1]
}

const guildGuardConfigs: GuildGuardConfig[] = [
    { path: '/api/guilds/:guildId/moderation', module: 'moderation' },
    { path: '/api/guilds/:guildId/automod', module: 'moderation' },
    { path: '/api/guilds/:guildId/logs', module: 'moderation' },
    { path: '/api/guilds/:guildId/commands', module: 'automation' },
    { path: '/api/guilds/:guildId/automessages', module: 'automation' },
    { path: '/api/guilds/:guildId/embeds', module: 'automation' },
    { path: '/api/guilds/:guildId/reaction-roles', module: 'automation' },
    { path: '/api/guilds/:guildId/roles', module: 'automation' },
    { path: '/api/guilds/:guildId/music', module: 'music' },
    { path: '/api/guilds/:guildId/twitch', module: 'integrations' },
    { path: '/api/guilds/:guildId/channels', module: 'integrations' },
    { path: '/api/guilds/:guildId/settings', module: 'settings' },
    { path: '/api/guilds/:guildId/modules', module: 'settings' },
    { path: '/api/guilds/:guildId/rbac', module: 'settings', mode: 'manage' },
    {
        path: '/api/guilds/:guildId/automation',
        module: 'settings',
        mode: 'manage',
    },
    { path: '/api/guilds/:id/features', module: 'automation' },
    { path: '/api/guilds/:guildId/levels', module: 'settings' },
    { path: '/api/guilds/:guildId/starboard', module: 'settings' },
]

const routeSetups = [
    setupAuthRoutes,
    setupToggleRoutes,
    setupGuildRoutes,
    setupManagementRoutes,
    setupModerationRoutes,
    setupLastFmRoutes,
    setupGuildSettingsRoutes,
    setupTrackHistoryRoutes,
    setupTwitchRoutes,
    setupLyricsRoutes,
    setupRolesRoutes,
    setupRbacRoutes,
    setupGuildAutomationRoutes,
    setupLevelsRoutes,
    setupStarboardRoutes,
]

export function setupRoutes(app: Express): void {
    setupHealthRoutes(app)
    app.use('/api/', apiLimiter)

    for (const config of guildGuardConfigs) {
        const middleware = config.mode
            ? requireGuildModuleAccess(config.module, config.mode)
            : requireGuildModuleAccess(config.module)

        app.use(config.path, requireAuth, middleware)
    }

    for (const setupRoute of routeSetups) {
        setupRoute(app)
    }

    app.use(errorHandler)
}
