import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupTwitchRoutes } from '../../../src/routes/twitch'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockListByGuild = jest.fn<any>()
const mockAdd = jest.fn<any>()
const mockRemove = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    twitchNotificationService: {
        listByGuild: (...args: any[]) => mockListByGuild(...args),
        add: (...args: any[]) => mockAdd(...args),
        remove: (...args: any[]) => mockRemove(...args),
    },
}))

describe('GET /api/twitch/status', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupTwitchRoutes(app)
        app.use(errorHandler)
    })

    test('returns configured=true when TWITCH_CLIENT_ID is set', async () => {
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
        const res = await request(app).get('/api/twitch/status')
        delete process.env.TWITCH_CLIENT_ID
        expect(res.status).toBe(200)
        expect(res.body.configured).toBe(true)
    })

    test('returns configured=false when TWITCH_CLIENT_ID is not set', async () => {
        delete process.env.TWITCH_CLIENT_ID
        const res = await request(app).get('/api/twitch/status')
        expect(res.status).toBe(200)
        expect(res.body.configured).toBe(false)
    })
})

describe('Twitch Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupTwitchRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    }

    describe('GET /api/guilds/:guildId/twitch/notifications', () => {
        test('should list notifications', async () => {
            authed()
            const notifications = [
                {
                    id: 'n1',
                    guildId: GUILD_ID,
                    twitchUserId: 'tw123',
                    twitchLogin: 'streamer1',
                    discordChannelId: '444444444444444444',
                },
            ]
            mockListByGuild.mockResolvedValue(notifications)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/twitch/notifications`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.notifications).toHaveLength(1)
            expect(mockListByGuild).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/twitch/notifications`,
            )

            expect(res.status).toBe(401)
        })
    })

    describe('POST /api/guilds/:guildId/twitch/notifications', () => {
        test('should add notification', async () => {
            authed()
            mockAdd.mockResolvedValue(true)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/twitch/notifications`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    twitchUserId: 'tw123',
                    twitchLogin: 'streamer1',
                    discordChannelId: '444444444444444444',
                })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockAdd).toHaveBeenCalledWith(
                GUILD_ID,
                '444444444444444444',
                'tw123',
                'streamer1',
            )
        })

        test('should reject invalid body', async () => {
            authed()

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/twitch/notifications`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ twitchUserId: 'tw123' })

            expect(res.status).toBe(400)
        })
    })

    describe('DELETE /api/guilds/:guildId/twitch/notifications', () => {
        test('should remove notification', async () => {
            authed()
            mockRemove.mockResolvedValue(true)

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/twitch/notifications`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ twitchUserId: 'tw123' })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockRemove).toHaveBeenCalledWith(GUILD_ID, 'tw123')
        })
    })
})
