/**
 * Reproduces and guards against #2409 / #2410: a guild route is protected by
 * TWO independent `requireGuildModuleAccess` checks that can disagree on
 * which module the caller needs, namely the path-prefix guard wired in
 * routes/index.ts
 * (`app.use(config.path, requireAuth, requireGuildModuleAccess(config.module, config.mode))`)
 * and a second check inside the route handler itself. When the two name
 * different modules, a user who holds exactly the module the dashboard nav
 * shows for that page (the prefix guard's module) still gets a 403, because
 * the handler's check demands a second, unrelated module too.
 *
 * These tests wire up each affected path exactly as routes/index.ts does,
 * with the real prefix middleware for that path, mounted the same way, in
 * front of the real route module, and assert that a caller holding ONLY the
 * prefix guard's module (at the method-appropriate view/manage level) can
 * complete the request, while a caller holding NONE of the guild's modules
 * is rejected with 403.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express, { type Express } from 'express'
import type { ModuleKey, AccessMode } from '@lucky/shared/services'
import { requireAuth } from '../../../src/middleware/auth'
import { requireGuildModuleAccess } from '../../../src/middleware/guildAccess'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { sessionService } from '../../../src/services/SessionService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import { setupRolesRoutes } from '../../../src/routes/roles'
import { setupManagementRoutes } from '../../../src/routes/management'
import { setupGuildRoutes } from '../../../src/routes/guilds'
import { setupRoleGroupsRoutes } from '../../../src/routes/roleGroups'
import { isRolesManagePath } from '../../../src/routes/rolesManageGuard'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildAccessService', () => ({
    guildAccessService: {
        resolveGuildContext: jest.fn(),
        hasAccess: jest.fn(),
        listAuthorizedGuilds: jest.fn(),
    },
}))

const mockListReactionRoles = jest.fn<any>()
const mockCreateReactionRole = jest.fn<any>()
const mockUpdateReactionRole = jest.fn<any>()
const mockDeleteReactionRole = jest.fn<any>()
const mockListExclusiveRoles = jest.fn<any>()
const mockGetSettings = jest.fn<any>()
const mockListTemplates = jest.fn<any>()
const mockApplyTemplate = jest.fn<any>()
const mockGetRecentLogs = jest.fn<any>()
const mockCountRecentLogs = jest.fn<any>()
const mockSearchLogs = jest.fn<any>()
const mockGetUserLogs = jest.fn<any>()
const mockGetStats = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        listReactionRoleMessages: (...a: any[]) => mockListReactionRoles(...a),
        createReactionRoleMessageFromDashboard: (...a: any[]) =>
            mockCreateReactionRole(...a),
        updateReactionRoleMessage: (...a: any[]) =>
            mockUpdateReactionRole(...a),
        deleteReactionRoleMessage: (...a: any[]) =>
            mockDeleteReactionRole(...a),
    },
    roleManagementService: {
        listExclusiveRoles: (...a: any[]) => mockListExclusiveRoles(...a),
    },
    autoModService: {
        getSettings: (...a: any[]) => mockGetSettings(...a),
        updateSettings: jest.fn().mockResolvedValue({}),
        listTemplates: (...a: any[]) => mockListTemplates(...a),
        applyTemplate: (...a: any[]) => mockApplyTemplate(...a),
    },
    serverLogService: {
        getRecentLogs: (...a: any[]) => mockGetRecentLogs(...a),
        countRecentLogs: (...a: any[]) => mockCountRecentLogs(...a),
        getLogsByType: jest.fn().mockResolvedValue([]),
        countLogsByType: jest.fn().mockResolvedValue(0),
        searchLogs: (...a: any[]) => mockSearchLogs(...a),
        getUserLogs: (...a: any[]) => mockGetUserLogs(...a),
        getStats: (...a: any[]) => mockGetStats(...a),
        logAutoModSettingsChange: jest.fn().mockResolvedValue(undefined),
        logCustomCommandChange: jest.fn().mockResolvedValue(undefined),
    },
    serializeServerLog: (log: unknown) => log,
    customCommandService: {
        listCommands: jest.fn().mockResolvedValue([]),
    },
    featureToggleService: {
        isEnabled: jest.fn().mockResolvedValue(true),
        setGuildFeatureToggle: jest.fn().mockResolvedValue(undefined),
    },
    AutoModTemplateNotFoundError: class AutoModTemplateNotFoundError extends Error {},
}))

const mockGetFullGuildRoles = jest.fn<any>()
const mockCreateGuildRole = jest.fn<any>()
const mockUpdateGuildRole = jest.fn<any>()
const mockDeleteGuildRole = jest.fn<any>()
const mockGetGuildRoleOptions = jest.fn<any>()

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        getFullGuildRoles: (...a: any[]) => mockGetFullGuildRoles(...a),
        createGuildRole: (...a: any[]) => mockCreateGuildRole(...a),
        updateGuildRole: (...a: any[]) => mockUpdateGuildRole(...a),
        deleteGuildRole: (...a: any[]) => mockDeleteGuildRole(...a),
        getGuildRoleOptions: (...a: any[]) => mockGetGuildRoleOptions(...a),
    },
}))

const mockListRoleGroups = jest.fn<any>()

jest.mock('../../../src/services/RoleGroupService', () => ({
    roleGroupService: {
        listRoleGroups: (...a: any[]) => mockListRoleGroups(...a),
    },
}))

const GUILD_ID = '111111111111111111'
const ROLE_ID = '222222222222222222'
const USER_ID = '333333333333333333'
const MESSAGE_ID = '444444444444444444'
const CHANNEL_ID = '555555555555555555'

type PrefixConfig = { path: string; module: ModuleKey; mode?: AccessMode }

/** Mirrors exactly how routes/index.ts wires a `guildGuardConfigs` entry. */
function buildApp(prefix: PrefixConfig, setups: Array<(app: Express) => void>) {
    const app = express()
    app.use(express.json())
    setupSessionMiddleware(app)

    const middleware = prefix.mode
        ? requireGuildModuleAccess(prefix.module, prefix.mode)
        : requireGuildModuleAccess(prefix.module)
    app.use(prefix.path, requireAuth, middleware)

    for (const setup of setups) {
        setup(app)
    }
    app.use(errorHandler)
    return app
}

/**
 * Mirrors the REAL composition in routes/index.ts for the `/roles` and
 * `/roles/manage` guildGuardConfigs entries: the broad `/roles` (automation)
 * guard skips requests under `/manage` (via the real, imported
 * `isRolesManagePath`), and the dedicated `/roles/manage` (settings:manage)
 * guard runs for those instead. Used to prove the security-review fix on PR
 * #2449 holds when both guards run together, not just in isolation.
 */
function buildRolesApp() {
    const app = express()
    app.use(express.json())
    setupSessionMiddleware(app)

    // Mirrors guildGuardConfigs' registration order for these three entries.
    app.use(
        '/api/guilds/:guildId/reaction-roles',
        requireAuth,
        requireGuildModuleAccess('automation'),
    )
    const rolesModuleCheck = requireGuildModuleAccess('automation')
    app.use('/api/guilds/:guildId/roles', requireAuth, (req, res, next) =>
        isRolesManagePath(req) ? next() : rolesModuleCheck(req, res, next),
    )
    app.use(
        '/api/guilds/:guildId/roles/manage',
        requireAuth,
        requireGuildModuleAccess('settings', 'manage'),
    )

    setupRolesRoutes(app)
    app.use(errorHandler)
    return app
}

function authed(allowedModule: ModuleKey | null) {
    const sessionMock = sessionService as jest.Mocked<typeof sessionService>
    sessionMock.getSession.mockResolvedValue(MOCK_SESSION_DATA)

    const accessMock = guildAccessService as jest.Mocked<
        typeof guildAccessService
    >
    accessMock.resolveGuildContext.mockResolvedValue({
        guildId: GUILD_ID,
        userId: MOCK_SESSION_DATA.userId,
        roles: [],
        permissions: new Set(),
    } as any)
    // A caller who holds `allowedModule` holds it at manage level, which also
    // satisfies a `view` requirement, matching real access-hierarchy semantics.
    accessMock.hasAccess.mockImplementation(
        (_ctx: unknown, module: ModuleKey) => module === allowedModule,
    )
}

type RouteCase = {
    name: string
    method: 'get' | 'post' | 'put' | 'patch' | 'delete'
    path: string
    prefix: PrefixConfig
    setups: Array<(app: Express) => void>
    query?: Record<string, string>
    body?: unknown
    mockHappyPath: () => void
    successStatus: number
    /**
     * A single module the caller must NOT satisfy this route with. Chosen as
     * the module this route used to (wrongly) also require pre-fix, so this
     * doubles as a regression guard against the double-module bug coming
     * back.
     */
    wrongModule: ModuleKey
}

const cases: RouteCase[] = [
    // -- management.ts: /automod/* is guarded by the moderation prefix but
    // re-checked the `settings` module in the handler (#2409).
    {
        name: 'GET /automod/settings',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/automod/settings`,
        prefix: { path: '/api/guilds/:guildId/automod', module: 'moderation' },
        setups: [setupManagementRoutes],
        mockHappyPath: () => mockGetSettings.mockResolvedValue({}),
        successStatus: 200,
        wrongModule: 'settings',
    },
    {
        name: 'PATCH /automod/settings',
        method: 'patch',
        path: `/api/guilds/${GUILD_ID}/automod/settings`,
        prefix: { path: '/api/guilds/:guildId/automod', module: 'moderation' },
        setups: [setupManagementRoutes],
        body: {},
        mockHappyPath: () => undefined,
        successStatus: 200,
        wrongModule: 'settings',
    },
    {
        name: 'GET /automod/templates',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/automod/templates`,
        prefix: { path: '/api/guilds/:guildId/automod', module: 'moderation' },
        setups: [setupManagementRoutes],
        mockHappyPath: () => mockListTemplates.mockResolvedValue([]),
        successStatus: 200,
        wrongModule: 'settings',
    },
    {
        name: 'POST /automod/templates/:templateId/apply',
        method: 'post',
        path: `/api/guilds/${GUILD_ID}/automod/templates/default-template/apply`,
        prefix: { path: '/api/guilds/:guildId/automod', module: 'moderation' },
        setups: [setupManagementRoutes],
        mockHappyPath: () =>
            mockApplyTemplate.mockResolvedValue({
                template: { id: 'default-template' },
                settings: { enabled: true },
            }),
        successStatus: 200,
        wrongModule: 'settings',
    },
    // -- management.ts: /logs is guarded by the moderation prefix but
    // re-checked the `overview` module in several handlers (#2409).
    {
        name: 'GET /logs',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/logs`,
        prefix: { path: '/api/guilds/:guildId/logs', module: 'moderation' },
        setups: [setupManagementRoutes],
        mockHappyPath: () => {
            mockGetRecentLogs.mockResolvedValue([])
            mockCountRecentLogs.mockResolvedValue(0)
        },
        successStatus: 200,
        wrongModule: 'overview',
    },
    {
        name: 'GET /logs/search',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/logs/search`,
        prefix: { path: '/api/guilds/:guildId/logs', module: 'moderation' },
        setups: [setupManagementRoutes],
        query: { q: 'test' },
        mockHappyPath: () => mockSearchLogs.mockResolvedValue([]),
        successStatus: 200,
        wrongModule: 'overview',
    },
    {
        name: 'GET /logs/users/:userId',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/logs/users/${USER_ID}`,
        prefix: { path: '/api/guilds/:guildId/logs', module: 'moderation' },
        setups: [setupManagementRoutes],
        mockHappyPath: () => mockGetUserLogs.mockResolvedValue([]),
        successStatus: 200,
        wrongModule: 'overview',
    },
    {
        name: 'GET /logs/stats',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/logs/stats`,
        prefix: { path: '/api/guilds/:guildId/logs', module: 'moderation' },
        setups: [setupManagementRoutes],
        mockHappyPath: () => mockGetStats.mockResolvedValue({}),
        successStatus: 200,
        wrongModule: 'overview',
    },
    // -- guilds.ts: /roles is guarded by the automation prefix but the
    // handler re-checked `overview` (used by the ReactionRoles page, which
    // itself lives under the automation module) (#2409).
    {
        name: 'GET /roles (guilds.ts)',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/roles`,
        prefix: { path: '/api/guilds/:guildId/roles', module: 'automation' },
        setups: [setupGuildRoutes],
        mockHappyPath: () => mockGetGuildRoleOptions.mockResolvedValue([]),
        successStatus: 200,
        wrongModule: 'overview',
    },
    // -- roles.ts: /reaction-roles is guarded by the automation prefix but
    // re-checked `overview` in every handler (#2409).
    {
        name: 'GET /reaction-roles',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/reaction-roles`,
        prefix: {
            path: '/api/guilds/:guildId/reaction-roles',
            module: 'automation',
        },
        setups: [setupRolesRoutes],
        mockHappyPath: () => mockListReactionRoles.mockResolvedValue([]),
        successStatus: 200,
        wrongModule: 'overview',
    },
    {
        name: 'POST /reaction-roles',
        method: 'post',
        path: `/api/guilds/${GUILD_ID}/reaction-roles`,
        prefix: {
            path: '/api/guilds/:guildId/reaction-roles',
            module: 'automation',
        },
        setups: [setupRolesRoutes],
        body: {
            channelId: CHANNEL_ID,
            title: 'Test Roles',
            description: 'Test description',
            roles: [{ roleId: ROLE_ID, label: 'Test Role' }],
        },
        mockHappyPath: () => {
            process.env.DISCORD_TOKEN = 'test-token'
            mockCreateReactionRole.mockResolvedValue({
                id: 'rrm-1',
                messageId: MESSAGE_ID,
                channelId: CHANNEL_ID,
                guildId: GUILD_ID,
                mappings: [],
            })
        },
        successStatus: 201,
        wrongModule: 'overview',
    },
    {
        name: 'PUT /reaction-roles/:messageId',
        method: 'put',
        path: `/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`,
        prefix: {
            path: '/api/guilds/:guildId/reaction-roles',
            module: 'automation',
        },
        setups: [setupRolesRoutes],
        body: {
            title: 'Updated',
            description: 'Updated description',
            roles: [{ roleId: ROLE_ID, label: 'Updated Role' }],
        },
        mockHappyPath: () => {
            process.env.DISCORD_TOKEN = 'test-token'
            mockUpdateReactionRole.mockResolvedValue({ messageId: MESSAGE_ID })
        },
        successStatus: 200,
        wrongModule: 'overview',
    },
    {
        name: 'DELETE /reaction-roles/:messageId',
        method: 'delete',
        path: `/api/guilds/${GUILD_ID}/reaction-roles/${MESSAGE_ID}`,
        prefix: {
            path: '/api/guilds/:guildId/reaction-roles',
            module: 'automation',
        },
        setups: [setupRolesRoutes],
        mockHappyPath: () => mockDeleteReactionRole.mockResolvedValue(true),
        successStatus: 200,
        wrongModule: 'overview',
    },
    // -- roles.ts: /roles/exclusive and /roles/manage/* are guarded by the
    // automation prefix but re-checked `overview` / `settings` (#2409).
    {
        name: 'GET /roles/exclusive',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/roles/exclusive`,
        prefix: { path: '/api/guilds/:guildId/roles', module: 'automation' },
        setups: [setupRolesRoutes],
        mockHappyPath: () => mockListExclusiveRoles.mockResolvedValue([]),
        successStatus: 200,
        wrongModule: 'overview',
    },
    {
        name: 'GET /roles/manage',
        method: 'get',
        path: `/api/guilds/${GUILD_ID}/roles/manage`,
        prefix: {
            path: '/api/guilds/:guildId/roles/manage',
            module: 'settings',
            mode: 'manage',
        },
        setups: [setupRolesRoutes],
        mockHappyPath: () => mockGetFullGuildRoles.mockResolvedValue([]),
        successStatus: 200,
        wrongModule: 'automation',
    },
    {
        name: 'POST /roles/manage',
        method: 'post',
        path: `/api/guilds/${GUILD_ID}/roles/manage`,
        prefix: {
            path: '/api/guilds/:guildId/roles/manage',
            module: 'settings',
            mode: 'manage',
        },
        setups: [setupRolesRoutes],
        body: { name: 'New Role' },
        mockHappyPath: () =>
            mockCreateGuildRole.mockResolvedValue({
                id: ROLE_ID,
                name: 'New Role',
            }),
        successStatus: 201,
        wrongModule: 'automation',
    },
    {
        name: 'PATCH /roles/manage/:roleId',
        method: 'patch',
        path: `/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`,
        prefix: {
            path: '/api/guilds/:guildId/roles/manage',
            module: 'settings',
            mode: 'manage',
        },
        setups: [setupRolesRoutes],
        body: { name: 'Renamed Role' },
        mockHappyPath: () =>
            mockUpdateGuildRole.mockResolvedValue({
                id: ROLE_ID,
                name: 'Renamed Role',
            }),
        successStatus: 200,
        wrongModule: 'automation',
    },
    {
        name: 'DELETE /roles/manage/:roleId',
        method: 'delete',
        path: `/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}`,
        prefix: {
            path: '/api/guilds/:guildId/roles/manage',
            module: 'settings',
            mode: 'manage',
        },
        setups: [setupRolesRoutes],
        mockHappyPath: () => mockDeleteGuildRole.mockResolvedValue(undefined),
        successStatus: 200,
        wrongModule: 'automation',
    },
    {
        name: 'POST /roles/manage/:roleId/duplicate',
        method: 'post',
        path: `/api/guilds/${GUILD_ID}/roles/manage/${ROLE_ID}/duplicate`,
        prefix: {
            path: '/api/guilds/:guildId/roles/manage',
            module: 'settings',
            mode: 'manage',
        },
        setups: [setupRolesRoutes],
        mockHappyPath: () => {
            mockGetFullGuildRoles.mockResolvedValue([
                {
                    id: ROLE_ID,
                    name: 'Source',
                    color: 0,
                    hoist: false,
                    mentionable: false,
                    permissions: '0',
                },
            ])
            mockCreateGuildRole.mockResolvedValue({
                id: '666666666666666666',
                name: 'Source (copy)',
            })
        },
        successStatus: 201,
        wrongModule: 'automation',
    },
    {
        name: 'POST /roles/manage/bulk-delete',
        method: 'post',
        path: `/api/guilds/${GUILD_ID}/roles/manage/bulk-delete`,
        prefix: {
            path: '/api/guilds/:guildId/roles/manage',
            module: 'settings',
            mode: 'manage',
        },
        setups: [setupRolesRoutes],
        body: { roleIds: [ROLE_ID] },
        mockHappyPath: () => mockDeleteGuildRole.mockResolvedValue(undefined),
        successStatus: 200,
        wrongModule: 'automation',
    },
]

describe('guild route guard consistency (#2409)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        process.env.DISCORD_TOKEN = 'test-token-default'
    })

    for (const c of cases) {
        describe(c.name, () => {
            test(`a caller holding only ${c.prefix.module} (the prefix guard's module) succeeds`, async () => {
                authed(c.prefix.module)
                c.mockHappyPath()
                const app = buildApp(c.prefix, c.setups)

                let req = (request(app) as any)
                    [c.method](c.path)
                    .set('Cookie', ['sessionId=valid_session_id'])
                if (c.query) req = req.query(c.query)
                if (c.body !== undefined) req = req.send(c.body)

                const res = await req
                expect(res.status).toBe(c.successStatus)
            })

            test('a caller holding none of the guild modules is rejected with 403', async () => {
                authed(null)
                c.mockHappyPath()
                const app = buildApp(c.prefix, c.setups)

                let req = (request(app) as any)
                    [c.method](c.path)
                    .set('Cookie', ['sessionId=valid_session_id'])
                if (c.query) req = req.query(c.query)
                if (c.body !== undefined) req = req.send(c.body)

                const res = await req
                expect(res.status).toBe(403)
            })

            // Security review on PR #2449, finding 2: a single WRONG module
            // must not satisfy this route either, whether or not it used to
            // (wrongly) be accepted before the #2409 fix.
            test(`a caller holding only ${c.wrongModule} (a different single module) is rejected with 403`, async () => {
                authed(c.wrongModule)
                c.mockHappyPath()
                const app = buildApp(c.prefix, c.setups)

                let req = (request(app) as any)
                    [c.method](c.path)
                    .set('Cookie', ['sessionId=valid_session_id'])
                if (c.query) req = req.query(c.query)
                if (c.body !== undefined) req = req.send(c.body)

                const res = await req
                expect(res.status).toBe(403)
            })
        })
    }
})

// Whether routes/index.ts actually stops forcing `mode: 'manage'` on
// role-groups is asserted directly against the real `guildGuardConfigs`
// wiring in tests/unit/routes/index.test.ts. This suite complements that by
// exercising the fixed (method-based) shape end-to-end through supertest,
// against the real setupRoleGroupsRoutes handler.
describe('role-groups guard mode consistency (#2410)', () => {
    const prefix: PrefixConfig = {
        path: '/api/guilds/:guildId/role-groups',
        module: 'settings',
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('GET /role-groups succeeds for a settings:view-only caller once the prefix mode is method-based', async () => {
        authed('settings')
        const accessMock = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        // Simulate a caller who has settings at VIEW level only (not manage).
        accessMock.hasAccess.mockImplementation(
            (_ctx: unknown, module: ModuleKey, mode: AccessMode) =>
                module === 'settings' && mode === 'view',
        )
        mockListRoleGroups.mockResolvedValue([])

        // No explicit `mode`, matching the fixed config (auto: view for GET).
        const app = buildApp(prefix, [setupRoleGroupsRoutes])

        const res = await request(app)
            .get(`/api/guilds/${GUILD_ID}/role-groups`)
            .set('Cookie', ['sessionId=valid_session_id'])

        expect(res.status).toBe(200)
    })

    test('GET /role-groups is still rejected for a caller with no settings access', async () => {
        authed(null)
        mockListRoleGroups.mockResolvedValue([])

        const app = buildApp(prefix, [setupRoleGroupsRoutes])

        const res = await request(app)
            .get(`/api/guilds/${GUILD_ID}/role-groups`)
            .set('Cookie', ['sessionId=valid_session_id'])

        expect(res.status).toBe(403)
    })
})

// Security review on PR #2449: CONFIRMED privilege escalation. /roles/manage
// (settings:manage) and /roles' other sub-paths (automation) are guarded by
// the SAME `/api/guilds/:guildId/roles` prefix, so both guards must run
// together with the real skip wiring to prove an automation-only caller
// cannot reach /roles/manage, since it accepts an arbitrary Discord
// permissions bitfield (a role granted Administrator there becomes
// guild-wide admin, see DiscordOAuthService/GuildAccessService). The
// isolated `buildApp` cases above only mount one guard at a time, so they
// cannot catch this; `buildRolesApp` mounts both, exactly like
// routes/index.ts does.
describe('roles vs roles/manage guard composition (security review on PR #2449)', () => {
    const rolesManageCases = cases.filter(
        (c) => c.prefix.path === '/api/guilds/:guildId/roles/manage',
    )

    beforeEach(() => {
        jest.clearAllMocks()
        process.env.DISCORD_TOKEN = 'test-token-default'
    })

    for (const c of rolesManageCases) {
        test(`${c.name}: automation:manage only is rejected with 403`, async () => {
            authed('automation')
            c.mockHappyPath()
            const app = buildRolesApp()

            let req = (request(app) as any)
                [c.method](c.path)
                .set('Cookie', ['sessionId=valid_session_id'])
            if (c.body !== undefined) req = req.send(c.body)

            const res = await req
            expect(res.status).toBe(403)
        })

        test(`${c.name}: settings:manage only succeeds`, async () => {
            authed('settings')
            c.mockHappyPath()
            const app = buildRolesApp()

            let req = (request(app) as any)
                [c.method](c.path)
                .set('Cookie', ['sessionId=valid_session_id'])
            if (c.body !== undefined) req = req.send(c.body)

            const res = await req
            expect(res.status).toBe(c.successStatus)
        })
    }

    test('settings:manage only is rejected with 403 on POST /reaction-roles, a real automation-only write', async () => {
        authed('settings')
        process.env.DISCORD_TOKEN = 'test-token'
        const app = buildRolesApp()

        const res = await request(app)
            .post(`/api/guilds/${GUILD_ID}/reaction-roles`)
            .set('Cookie', ['sessionId=valid_session_id'])
            .send({
                channelId: CHANNEL_ID,
                title: 'Test Roles',
                description: 'Test description',
                roles: [{ roleId: ROLE_ID, label: 'Test Role' }],
            })

        expect(res.status).toBe(403)
    })

    test('a mixed-case /ROLES/MANAGE path still requires settings:manage: automation:manage only is rejected with 403', async () => {
        authed('automation')
        mockGetFullGuildRoles.mockResolvedValue([])
        const app = buildRolesApp()

        const res = await request(app)
            .get(`/api/guilds/${GUILD_ID}/ROLES/MANAGE`)
            .set('Cookie', ['sessionId=valid_session_id'])

        expect(res.status).toBe(403)
    })

    test('a mixed-case /ROLES/MANAGE path succeeds for a settings:manage caller', async () => {
        authed('settings')
        mockGetFullGuildRoles.mockResolvedValue([])
        const app = buildRolesApp()

        const res = await request(app)
            .get(`/api/guilds/${GUILD_ID}/ROLES/MANAGE`)
            .set('Cookie', ['sessionId=valid_session_id'])

        expect(res.status).toBe(200)
    })
})
