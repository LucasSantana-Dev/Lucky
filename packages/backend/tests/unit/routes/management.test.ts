import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
} from '@jest/globals'
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
    customCommandService: {
        listCommands: jest.fn().mockResolvedValue([]),
        createCommand: jest.fn().mockResolvedValue({ name: 'test' }),
        updateCommand: jest.fn().mockResolvedValue({ name: 'test' }),
        deleteCommand: jest.fn().mockResolvedValue({}),
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
        updateMessage: jest.fn().mockResolvedValue({ id: 'msg-1', type: 'welcome' }),
        toggleMessage: jest.fn().mockResolvedValue({ id: 'msg-1', type: 'welcome' }),
        deleteMessage: jest.fn().mockResolvedValue({}),
    },
    serverLogService: {
        logAutoModSettingsChange: jest.fn().mockResolvedValue({}),
        logCustomCommandChange: jest.fn().mockResolvedValue({}),
        logEmbedTemplateChange: jest.fn().mockResolvedValue({}),
        logAutoMessageChange: jest.fn().mockResolvedValue({}),
        getLogsByType: jest.fn().mockResolvedValue([]),
        getRecentLogs: jest.fn().mockResolvedValue([]),
        countLogsByType: jest.fn().mockResolvedValue(0),
        countRecentLogs: jest.fn().mockResolvedValue(0),
        searchLogs: jest.fn().mockResolvedValue([]),
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
    app.use(
        (
            err: any,
            _req: Request,
            res: Response,
            _next: NextFunction,
        ) => {
            res.status(err.statusCode ?? 500).json({ error: err.message })
        },
    )
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
                    return (_req: Request, _res: Response, next: NextFunction) => {
                        const res = _res as any
                        res.status(403).json({ error: 'Forbidden' })
                        res.statusCode = 403
                    }
                },
            )
        })

        test('PATCH /api/guilds/:guildId/automod/settings returns 403 without manage access', async () => {
            const app = createApp()
            const res = await request(app)
                .patch('/api/guilds/guild-123/automod/settings')
                .send({ enabled: false })

            expect(res.status).toBe(403)
            expect(res.body.error).toBe('Forbidden')
        })

        test('POST /api/guilds/:guildId/commands returns 403 without manage access', async () => {
            const app = createApp()
            const res = await request(app)
                .post('/api/guilds/guild-123/commands')
                .send({ name: 'test', response: 'hello' })

            expect(res.status).toBe(403)
            expect(res.body.error).toBe('Forbidden')
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

        test('requireGuildModuleAccess is called for automod state-changing routes', async () => {
            const app = createApp()
            await request(app)
                .patch('/api/guilds/guild-123/automod/settings')
                .send({ enabled: false })

            expect(requireGuildModuleAccess).toHaveBeenCalledWith(
                'settings',
                'manage',
            )
        })

        test('requireGuildModuleAccess is called for command state-changing routes', async () => {
            const app = createApp()
            await request(app)
                .post('/api/guilds/guild-123/commands')
                .send({ name: 'test', response: 'hello' })

            expect(requireGuildModuleAccess).toHaveBeenCalledWith(
                'automation',
                'manage',
            )
        })

        test('requireGuildModuleAccess is called with view mode for GET routes', async () => {
            const app = createApp()
            await request(app).get('/api/guilds/guild-123/logs')

            expect(requireGuildModuleAccess).toHaveBeenCalledWith(
                'overview',
                'view',
            )
        })
    })
})
