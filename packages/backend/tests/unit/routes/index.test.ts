import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import type { Express } from 'express'

const setupHealthRoutes = jest.fn()
const setupStatsRoutes = jest.fn()
const setupInviteRoute = jest.fn()
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
const setupRoleGroupsRoutes = jest.fn()
const setupRbacRoutes = jest.fn()
const setupGuildAutomationRoutes = jest.fn()
const setupLevelsRoutes = jest.fn()
const setupStarboardRoutes = jest.fn()
const setupMusicRoutes = jest.fn()
const setupSpotifyRoutes = jest.fn()
const setupArtistsRoutes = jest.fn()
const setupSupportRoutes = jest.fn()
const setupSecurityRoutes = jest.fn()
const setupInternalNotifyRoutes = jest.fn()
const setupWebhookApiRoutes = jest.fn()
const setupWebhookPublicRoutes = jest.fn()
const setupAdminRoutes = jest.fn()
const setupBatchJobRoutes = jest.fn()

const requireGuildModuleAccess = jest.fn()
const apiLimiter = jest.fn()
const writeLimiter = jest.fn()
const requireAuth = jest.fn()
const requireAdmin = jest.fn()
const errorHandler = jest.fn()

jest.mock('../../../src/routes/health', () => ({
    setupHealthRoutes,
}))

jest.mock('../../../src/routes/stats', () => ({
    setupStatsRoutes,
}))

jest.mock('../../../src/routes/invite', () => ({
    setupInviteRoute,
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

jest.mock('../../../src/routes/roleGroups', () => ({
    setupRoleGroupsRoutes,
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

jest.mock('../../../src/routes/support', () => ({
    setupSupportRoutes,
}))

jest.mock('../../../src/routes/internalNotify', () => ({
    setupInternalNotifyRoutes,
}))

jest.mock('../../../src/routes/security', () => ({
    setupSecurityRoutes,
}))

jest.mock('../../../src/routes/webhooks', () => ({
    setupWebhookApiRoutes,
    setupWebhookPublicRoutes,
}))

jest.mock('../../../src/routes/admin', () => ({
    setupAdminRoutes,
}))

jest.mock('../../../src/routes/batchJobs', () => ({
    setupBatchJobRoutes,
}))

jest.mock('../../../src/middleware/rateLimit', () => ({
    apiLimiter,
    writeLimiter,
}))

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth,
}))

jest.mock('../../../src/middleware/requireAdmin', () => ({
    requireAdmin,
}))

jest.mock('../../../src/middleware/guildAccess', () => ({
    requireGuildModuleAccess,
}))

jest.mock('../../../src/middleware/errorHandler', () => ({
    errorHandler,
}))

import { setupRoutes } from '../../../src/routes'

type MockApp = Pick<Express, 'use' | 'get' | 'post'>

describe('setupRoutes', () => {
    const app: MockApp = {
        use: jest.fn() as unknown as Express['use'],
        get: jest.fn() as unknown as Express['get'],
        post: jest.fn() as unknown as Express['post'],
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
        expect(setupStatsRoutes).toHaveBeenCalledWith(app)
        expect(setupInviteRoute).toHaveBeenCalledWith(app)
        expect(setupInternalNotifyRoutes).toHaveBeenCalledWith(app)
        expect(setupWebhookPublicRoutes).toHaveBeenCalledWith(app)
        expect(setupSecurityRoutes).toHaveBeenCalledWith(app)
        expect(app.use).toHaveBeenCalledWith('/api/', apiLimiter)
        expect(app.use).toHaveBeenCalledWith(
            '/api/admin',
            requireAuth,
            requireAdmin,
        )
        expect(app.use).toHaveBeenCalledWith(
            '/api/toggles/global',
            requireAuth,
            requireAdmin,
            writeLimiter,
        )
        expect(setupAdminRoutes).toHaveBeenCalledWith(app)
        expect(setupWebhookApiRoutes).toHaveBeenCalledWith(app)
        expect(setupSupportRoutes).toHaveBeenCalledWith(app)
        expect(setupBatchJobRoutes).toHaveBeenCalledWith(app)

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
        // Security review on PR #2449: /roles/manage/* must be guarded by
        // its OWN settings:manage check, never by the broader /roles
        // (automation) guard, since a role's permissions bitfield can be set
        // there (privilege escalation to Administrator otherwise).
        expect(app.use).toHaveBeenCalledWith(
            '/api/guilds/:guildId/roles/manage',
            requireAuth,
            'settings:manage',
        )

        // The /roles guard must SKIP requests under /manage (that dedicated
        // settings:manage guard above is what applies instead), so an
        // automation-only caller cannot fall through to it and reach
        // /roles/manage/*. Pull the actual guard function registered for
        // '/roles' and exercise its skip branch directly: if it did not
        // skip, it would call the mocked module-check tag as a function and
        // throw, since the mock returns a plain string, not a function.
        const rolesGuardCall = useCalls.find(
            (call) => call[0] === '/api/guilds/:guildId/roles',
        )
        const rolesGuard = rolesGuardCall?.[2] as (
            req: { path: string },
            res: unknown,
            next: () => void,
        ) => void
        const next = jest.fn()
        expect(() =>
            rolesGuard({ path: '/manage/111111111111111111' }, {}, next),
        ).not.toThrow()
        expect(next).toHaveBeenCalled()

        // cubic review on PR #2449: the test above only proves the skip
        // branch works. It would still pass if the guard skipped
        // EVERYTHING (e.g. `skip: () => true`), silently disabling the
        // automation check on every /roles path. Prove the non-skip branch
        // is wired too: for a path that is not /manage, the guard must
        // call the automation module-check (the mocked tag, a plain
        // string above, not a function), so invoking it throws.
        expect(() =>
            rolesGuard({ path: '/exclusive' }, {}, jest.fn()),
        ).toThrow()

        // #2410: role-groups must NOT force manage mode on every method. GET
        // should resolve to view like its /roles and /reaction-roles
        // siblings, so a settings:view-only user can load the page.
        expect(requireGuildModuleAccess).toHaveBeenCalledWith('settings')
        expect(app.use).toHaveBeenCalledWith(
            '/api/guilds/:guildId/role-groups',
            requireAuth,
            'settings:view',
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
        expect(setupRoleGroupsRoutes).toHaveBeenCalledWith(app)
        expect(setupRbacRoutes).toHaveBeenCalledWith(app)
        expect(setupGuildAutomationRoutes).toHaveBeenCalledWith(app)
        expect(setupLevelsRoutes).toHaveBeenCalledWith(app)
        expect(setupStarboardRoutes).toHaveBeenCalledWith(app)
        expect(setupMusicRoutes).toHaveBeenCalledWith(app)
        expect(setupSpotifyRoutes).toHaveBeenCalledWith(app)
        expect(setupArtistsRoutes).toHaveBeenCalledWith(app)

        expect(app.use).toHaveBeenCalledWith(errorHandler)
        expect(useCalls[0]).toEqual(['/api/', apiLimiter])
        expect(useCalls[useCalls.length - 1]).toEqual([errorHandler])

        const apiLimiterOrder = app.use.mock.invocationCallOrder[0]
        expect(
            setupWebhookPublicRoutes.mock.invocationCallOrder[0],
        ).toBeLessThan(apiLimiterOrder)
        expect(
            setupWebhookApiRoutes.mock.invocationCallOrder[0],
        ).toBeGreaterThan(apiLimiterOrder)

        const rbacGuardIndex = useCalls.findIndex(
            (call) => call[0] === '/api/guilds/:guildId/rbac',
        )
        expect(useCalls[rbacGuardIndex]).toEqual([
            '/api/guilds/:guildId/rbac',
            requireAuth,
            'settings:manage',
        ])

        const rbacGuardCallOrder =
            app.use.mock.invocationCallOrder[rbacGuardIndex]
        const firstRouteSetupOrder = setupAuthRoutes.mock.invocationCallOrder[0]
        expect(rbacGuardCallOrder).toBeLessThan(firstRouteSetupOrder)
    })
})
