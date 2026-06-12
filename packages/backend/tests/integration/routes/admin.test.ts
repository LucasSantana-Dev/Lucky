import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupAdminRoutes } from '../../../src/routes/admin'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { sessionService } from '../../../src/services/SessionService'
import { requireAuth } from '../../../src/middleware/auth'
import { requireAdmin } from '../../../src/middleware/requireAdmin'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockGetAllBotGuilds = jest.fn<any>()

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        getAllBotGuilds: (...args: any[]) => mockGetAllBotGuilds(...args),
    },
}))

jest.mock('../../../src/middleware/requireAdmin', () => ({
    isDeveloperUser: (userId?: string) => userId === '123456789',
    requireAdmin: jest.requireActual('../../../src/middleware/requireAdmin').requireAdmin,
}))

const ADMIN_SESSION = { ...MOCK_SESSION_DATA, userId: '123456789' }
const NON_ADMIN_SESSION = { ...MOCK_SESSION_DATA, userId: '999999999' }

const MOCK_GUILDS = [
    {
        id: '111111111111111111',
        name: 'Test Server',
        iconUrl: 'https://cdn.discordapp.com/icons/111111111111111111/abc.png?size=64',
        memberCount: 42,
        textChannelCount: 5,
        voiceChannelCount: 2,
        roleCount: 3,
    },
    {
        id: '222222222222222222',
        name: 'Another Server',
        iconUrl: null,
        memberCount: 100,
        textChannelCount: 10,
        voiceChannelCount: 4,
        roleCount: 7,
    },
]

describe('Admin Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        jest.clearAllMocks()
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        app.use('/api/admin', requireAuth, requireAdmin)
        setupAdminRoutes(app)
        app.use(errorHandler)
    })

    describe('GET /api/admin/guilds', () => {
        test('returns guild list for admin user', async () => {
            const mockSessionService = sessionService as jest.Mocked<typeof sessionService>
            mockSessionService.getSession.mockResolvedValue(ADMIN_SESSION)
            mockGetAllBotGuilds.mockResolvedValue(MOCK_GUILDS)

            const response = await request(app)
                .get('/api/admin/guilds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ guilds: MOCK_GUILDS })
            expect(mockGetAllBotGuilds).toHaveBeenCalledTimes(1)
        })

        test('returns empty guild list when bot has no guilds', async () => {
            const mockSessionService = sessionService as jest.Mocked<typeof sessionService>
            mockSessionService.getSession.mockResolvedValue(ADMIN_SESSION)
            mockGetAllBotGuilds.mockResolvedValue([])

            const response = await request(app)
                .get('/api/admin/guilds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({ guilds: [] })
        })

        test('returns 403 for authenticated non-admin user', async () => {
            const mockSessionService = sessionService as jest.Mocked<typeof sessionService>
            mockSessionService.getSession.mockResolvedValue(NON_ADMIN_SESSION)

            const response = await request(app)
                .get('/api/admin/guilds')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(403)

            expect(response.body).toEqual({ error: 'Admin access required' })
            expect(mockGetAllBotGuilds).not.toHaveBeenCalled()
        })

        test('returns 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<typeof sessionService>
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/admin/guilds')
                .expect(401)

            expect(response.body).toEqual({ error: 'Not authenticated' })
            expect(mockGetAllBotGuilds).not.toHaveBeenCalled()
        })
    })
})
