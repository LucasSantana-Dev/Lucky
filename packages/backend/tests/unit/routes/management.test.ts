import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { Request, Response, NextFunction } from 'express'

const requireGuildModuleAccess = jest.fn()

jest.mock('../../../src/middleware/guildAccess', () => ({
    requireGuildModuleAccess,
}))

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
        ;(req as any).sessionId = 'session-123'
        ;(req as any).userId = 'user-123'
        next()
    },
}))

jest.mock('@lucky/shared/services', () => ({
    autoModService: {
        getSettings: jest.fn().mockResolvedValue({ enabled: true }),
        updateSettings: jest.fn().mockResolvedValue({ enabled: true }),
        listTemplates: jest.fn().mockResolvedValue([]),
        applyTemplate: jest.fn().mockResolvedValue({
            template: { id: 'tpl-1' },
            settings: { enabled: true },
        }),
    },
    embedBuilderService: {
        listTemplates: jest.fn().mockResolvedValue([]),
        createTemplate: jest.fn().mockResolvedValue({ name: 'test' }),
        validateEmbedData: jest.fn().mockReturnValue({ valid: true }),
        updateTemplate: jest.fn().mockResolvedValue({ name: 'test' }),
        deleteTemplate: jest.fn().mockResolvedValue({}),
    },
    autoMessageService: {
        getMessagesByType: jest.fn().mockResolvedValue([]),
        getWelcomeMessage: jest.fn().mockResolvedValue(null),
        getLeaveMessage: jest.fn().mockResolvedValue(null),
        createMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        updateMessage: jest
            .fn()
            .mockResolvedValue({ id: 'msg-1', type: 'welcome' }),
        toggleMessage: jest
            .fn()
            .mockResolvedValue({ id: 'msg-1', type: 'welcome' }),
        deleteMessage: jest.fn().mockResolvedValue({}),
    },
    serverLogService: {
        logAutoModSettingsChange: jest.fn().mockResolvedValue({}),
        logEmbedTemplateChange: jest.fn().mockResolvedValue({}),
        logAutoMessageChange: jest.fn().mockResolvedValue({}),
        getLogsByType: jest.fn().mockResolvedValue([]),
        getRecentLogs: jest.fn().mockResolvedValue([]),
        countLogsByType: jest.fn().mockResolvedValue(0),
        countRecentLogs: jest.fn().mockResolvedValue(0),
        searchLogs: jest.fn().mockResolvedValue([]),
        countSearchLogs: jest.fn().mockResolvedValue(0),
        getUserLogs: jest.fn().mockResolvedValue([]),
        getStats: jest.fn().mockResolvedValue({}),
    },
}))

import express from 'express'
import request from 'supertest'
import { setupManagementRoutes } from '../../../src/routes/management'

function createApp() {
    const app = express()
    app.use(express.json())
    setupManagementRoutes(app)
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        res.status(err.statusCode ?? 500).json({ error: err.message })
    })
    return app
}

describe('Management Routes RBAC', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('Unauthorized access without guild module access', () => {
        beforeEach(() => {
            requireGuildModuleAccess.mockImplementation(
                (_module: string, _mode?: string) => {
                    return (
                        _req: Request,
                        _res: Response,
                        next: NextFunction,
                    ) => {
                        const res = _res as any
                        res.status(403).json({ error: 'Forbidden' })
                        res.statusCode = 403
                    }
                },
            )
        })

        test('PATCH /api/guilds/:guildId/embeds/:name returns 403 without manage access', async () => {
            const app = createApp()
            const res = await request(app)
                .patch('/api/guilds/guild-123/embeds/test-embed')
                .send({ title: 'Updated' })

            expect(res.status).toBe(403)
            expect(res.body.error).toBe('Forbidden')
        })
    })

    describe('Middleware is applied correctly', () => {
        beforeEach(() => {
            requireGuildModuleAccess.mockReturnValue(
                (req: Request, _res: Response, next: NextFunction) => {
                    next()
                },
            )
        })

        // #2409: /automod/* and /logs/* used to register a second,
        // handler-level requireGuildModuleAccess('settings', ...) /
        // ('overview', ...) check on top of the `/automod` (moderation) and
        // `/logs` (moderation) prefix guards wired in routes/index.ts,
        // forcing callers to hold two unrelated modules. Those handler-level
        // checks were removed, so routes/index.ts's prefix guard is now the
        // only check for these paths.
        //
        // cubic review on PR #2449: this scans every route this file
        // registers (embeds, automessages included), not just
        // /automod and /logs, so a future handler that legitimately needs
        // `settings` would fail here with a misleading name. Scoped title to
        // match the actual file-wide assertion.
        test('requireGuildModuleAccess is never registered with settings or overview anywhere in setupManagementRoutes', () => {
            createApp()

            const calledModules = requireGuildModuleAccess.mock.calls.map(
                (call) => call[0],
            )
            expect(calledModules).not.toContain('settings')
            expect(calledModules).not.toContain('overview')
        })

        test('requireGuildModuleAccess is called for embed state-changing routes', async () => {
            const app = createApp()
            await request(app)
                .post('/api/guilds/guild-123/embeds')
                .send({ name: 'test', title: 'hello' })

            expect(requireGuildModuleAccess).toHaveBeenCalledWith(
                'automation',
                'manage',
            )
        })
    })
})
