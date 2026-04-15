import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import type { Express } from 'express'

const setupHealthRoutes = jest.fn()
const setupAuthRoutes = jest.fn()
const setupToggleRoutes = jest.fn()
const setupGuildRoutes = jest.fn()
const setupManagementRoutes = jest.fn()
const setupModerationRoutes = jest.fn()
const setupLastFmRoutes = jest.fn()
const setupGuildSettingsRoutes = jest.fn()
const setupTrackHistoryRoutes = jest.fn()
const setupTwitchRoutes = jest.fn()
const setupLyricsRoutes = jest.fn()
const setupRolesRoutes = jest.fn()
const setupRbacRoutes = jest.fn()
const setupGuildAutomationRoutes = jest.fn()
const setupLevelsRoutes = jest.fn()
const setupStarboardRoutes = jest.fn()
const setupMusicRoutes = jest.fn()
const setupSpotifyRoutes = jest.fn()
const setupArtistsRoutes = jest.fn()
const setupInternalNotifyRoutes = jest.fn()

const requireGuildModuleAccess = jest.fn()
const apiLimiter = jest.fn()
const requireAuth = jest.fn()
const errorHandler = jest.fn()

jest.mock('../../../src/routes/health', () => ({
    setupHealthRoutes,
}))

jest.mock('../../../src/routes/auth', () => ({
    setupAuthRoutes,
}))

jest.mock('../../../src/routes/toggles', () => ({
    setupToggleRoutes,
}))

jest.mock('../../../src/routes/guilds', () => ({
    setupGuildRoutes,
}))

jest.mock('../../../src/routes/management', () => ({
    setupManagementRoutes,
}))

jest.mock('../../../src/routes/moderation', () => ({
    setupModerationRoutes,
}))

jest.mock('../../../src/routes/lastfm', () => ({
    setupLastFmRoutes,
}))

jest.mock('../../../src/routes/guildSettings', () => ({
    setupGuildSettingsRoutes,
}))

jest.mock('../../../src/routes/trackHistory', () => ({
    setupTrackHistoryRoutes,
}))

jest.mock('../../../src/routes/twitch', () => ({
    setupTwitchRoutes,
}))

jest.mock('../../../src/routes/lyrics', () => ({
    setupLyricsRoutes,
}))

jest.mock('../../../src/routes/roles', () => ({
    setupRolesRoutes,
}))

jest.mock('../../../src/routes/rbac', () => ({
    setupRbacRoutes,
}))

jest.mock('../../../src/routes/guildAutomation', () => ({
    setupGuildAutomationRoutes,
}))

jest.mock('../../../src/routes/levels', () => ({
    setupLevelsRoutes,
}))

jest.mock('../../../src/routes/starboard', () => ({
    setupStarboardRoutes,
}))

jest.mock('../../../src/routes/music', () => ({
    setupMusicRoutes,
}))

jest.mock('../../../src/routes/spotify', () => ({
    setupSpotifyRoutes,
}))

jest.mock('../../../src/routes/artists', () => ({
    setupArtistsRoutes,
}))

jest.mock("../../../src/routes/internalNotify", () => ({
    setupInternalNotifyRoutes,
}))

jest.mock('../../../src/middleware/rateLimit', () => ({
    apiLimiter,
}))

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth,
}))

jest.mock('../../../src/middleware/guildAccess', () => ({
    requireGuildModuleAccess,
}))

jest.mock('../../../src/middleware/errorHandler', () => ({
    errorHandler,
}))

import { setupRoutes } from '../../../src/routes'

type MockApp = Pick<Express, 'use'>

describe('setupRoutes', () => {
    const app: MockApp = {
        use: jest.fn() as unknown as Express['use'],
    }

    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildModuleAccess.mockImplementation(
            (module: string, mode?: string) => `${module}:${mode ?? 'view'}`,
        )
    })

    test('registers route guards, route modules, and error handler', () => {
        setupRoutes(app as Express)
        const useCalls = app.use.mock.calls as unknown[][]

        expect(setupHealthRoutes).toHaveBeenCalledWith(app)
        expect(setupInternalNotifyRoutes).toHaveBeenCalledWith(app)
        expect(app.use).toHaveBeenCalledWith('/api/', apiLimiter)

        expect(requireGuildModuleAccess).toHaveBeenCalledWith('moderation')
        expect(requireGuildModuleAccess).toHaveBeenCalledWith('automation')
        expect(requireGuildModuleAccess).toHaveBeenCalledWith('music')
        expect(requireGuildModuleAccess).toHaveBeenCalledWith('integrations')
        expect(requireGuildModuleAccess).toHaveBeenCalledWith('settings')
        expect(requireGuildModuleAccess).toHaveBeenCalledWith(
            'settings',
            'manage',
        )

        expect(app.use).toHaveBeenCalledWith(
            '/api/guilds/:guildId/rbac',
            requireAuth,
            'settings:manage',
        )
        expect(app.use).toHaveBeenCalledWith(
            '/api/guilds/:id/features',
            requireAuth,
            'automation:view',
        )

        expect(setupAuthRoutes).toHaveBeenCalledWith(app)
        expect(setupToggleRoutes).toHaveBeenCalledWith(app)
        expect(setupGuildRoutes).toHaveBeenCalledWith(app)
        expect(setupManagementRoutes).toHaveBeenCalledWith(app)
        expect(setupModerationRoutes).toHaveBeenCalledWith(app)
        expect(setupLastFmRoutes).toHaveBeenCalledWith(app)
        expect(setupGuildSettingsRoutes).toHaveBeenCalledWith(app)
        expect(setupTrackHistoryRoutes).toHaveBeenCalledWith(app)
        expect(setupTwitchRoutes).toHaveBeenCalledWith(app)
        expect(setupLyricsRoutes).toHaveBeenCalledWith(app)
        expect(setupRolesRoutes).toHaveBeenCalledWith(app)
        expect(setupRbacRoutes).toHaveBeenCalledWith(app)
        expect(setupGuildAutomationRoutes).toHaveBeenCalledWith(app)
        expect(setupLevelsRoutes).toHaveBeenCalledWith(app)
        expect(setupStarboardRoutes).toHaveBeenCalledWith(app)
        expect(setupMusicRoutes).toHaveBeenCalledWith(app)
        expect(setupArtistsRoutes).toHaveBeenCalledWith(app)

        expect(app.use).toHaveBeenCalledWith(errorHandler)
        expect(useCalls[0]).toEqual(['/api/', apiLimiter])
        expect(useCalls[useCalls.length - 1]).toEqual([errorHandler])

        const rbacGuardIndex = useCalls.findIndex(
            (call) => call[0] === '/api/guilds/:guildId/rbac',
        )
        expect(useCalls[rbacGuardIndex]).toEqual([
            '/api/guilds/:guildId/rbac',
            requireAuth,
            'settings:manage',
        ])

        const featuresGuardIndex = useCalls.findIndex(
            (call) => call[0] === '/api/guilds/:id/features',
        )
        const rbacGuardCallOrder =
            app.use.mock.invocationCallOrder[rbacGuardIndex]
        const featuresGuardCallOrder =
            app.use.mock.invocationCallOrder[featuresGuardIndex]
        const firstRouteSetupOrder = setupAuthRoutes.mock.invocationCallOrder[0]
        expect(rbacGuardCallOrder).toBeLessThan(firstRouteSetupOrder)
        expect(featuresGuardCallOrder).toBeLessThan(firstRouteSetupOrder)
    })
})
