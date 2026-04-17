import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupPlaybackRoutes } from '../../../src/routes/music/playbackRoutes'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockSendCommand = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        sendCommand: (...args: any[]) => mockSendCommand(...args),
    },
    MusicControlService: {
        createCommandId: () => 'test-cmd-id',
    },
}))

const SESSION_COOKIE = ['sessionId=valid_session_id']

describe.skip('Music Playback Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupPlaybackRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    }

    describe('POST /api/guilds/:guildId/music/play', () => {
        test('returns 401 without auth', async () => {
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/play`)
                .send({ query: 'test' })
                .expect(401)
        })

        test('returns 400 without query', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/play`)
                .set('Cookie', SESSION_COOKIE)
                .send({})
                .expect(400)
        })

        test('plays with query', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/play`)
                .set('Cookie', SESSION_COOKIE)
                .send({ query: 'bohemian rhapsody' })
                .expect(200)

            expect(res.body.success).toBe(true)
            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: GUILD_ID,
                    type: 'play',
                    data: expect.objectContaining({
                        query: 'bohemian rhapsody',
                    }),
                }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/pause', () => {
        test('returns 401 without auth', async () => {
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/pause`)
                .expect(401)
        })

        test('sends pause command', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/pause`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'pause',
                    guildId: GUILD_ID,
                }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/resume', () => {
        test('sends resume command', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/resume`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'resume' }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/skip', () => {
        test('sends skip command', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/skip`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'skip' }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/stop', () => {
        test('sends stop command', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/stop`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'stop' }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/volume', () => {
        test('returns 400 for invalid volume', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/volume`)
                .set('Cookie', SESSION_COOKIE)
                .send({ volume: 150 })
                .expect(400)
        })

        test('returns 400 for negative volume', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/volume`)
                .set('Cookie', SESSION_COOKIE)
                .send({ volume: -10 })
                .expect(400)
        })

        test('returns 400 for non-number volume', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/volume`)
                .set('Cookie', SESSION_COOKIE)
                .send({ volume: 'loud' })
                .expect(400)
        })

        test('sets volume correctly', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/volume`)
                .set('Cookie', SESSION_COOKIE)
                .send({ volume: 75 })
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'volume',
                    data: { volume: 75 },
                }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/shuffle', () => {
        test('sends shuffle command', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/shuffle`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'shuffle' }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/repeat', () => {
        test('returns 400 for invalid mode', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/repeat`)
                .set('Cookie', SESSION_COOKIE)
                .send({ mode: 'invalid' })
                .expect(400)
        })

        test('sets repeat mode', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/repeat`)
                .set('Cookie', SESSION_COOKIE)
                .send({ mode: 'track' })
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'repeat',
                    data: { mode: 'track' },
                }),
            )
        })

        test('sets repeat mode to autoplay', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/repeat`)
                .set('Cookie', SESSION_COOKIE)
                .send({ mode: 'autoplay' })
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'repeat',
                    data: { mode: 'autoplay' },
                }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/seek', () => {
        test('returns 400 for negative position', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/seek`)
                .set('Cookie', SESSION_COOKIE)
                .send({ position: -100 })
                .expect(400)
        })

        test('returns 400 for non-number position', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/seek`)
                .set('Cookie', SESSION_COOKIE)
                .send({ position: 'middle' })
                .expect(400)
        })

        test('seeks to position', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/seek`)
                .set('Cookie', SESSION_COOKIE)
                .send({ position: 30000 })
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'seek',
                    data: { position: 30000 },
                }),
            )
        })
    })
})
