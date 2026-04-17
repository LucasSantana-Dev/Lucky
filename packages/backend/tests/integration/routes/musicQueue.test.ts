import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupQueueRoutes } from '../../../src/routes/music/queueRoutes'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockSendCommand = jest.fn<any>()
const mockGetState = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        sendCommand: (...args: any[]) => mockSendCommand(...args),
        getState: (...args: any[]) => mockGetState(...args),
    },
    MusicControlService: {
        createCommandId: () => 'test-cmd-id',
    },
}))

const SESSION_COOKIE = ['sessionId=valid_session_id']

describe.skip('Music Queue Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupQueueRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    }

    describe('GET /api/guilds/:guildId/music/queue', () => {
        test('returns 401 without auth', async () => {
            await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/queue`)
                .expect(401)
        })

        test('returns queue with tracks', async () => {
            authed()
            mockGetState.mockResolvedValue({
                currentTrack: { title: 'Now Playing', author: 'Artist' },
                tracks: [
                    { title: 'Track 1', author: 'Artist 1' },
                    { title: 'Track 2', author: 'Artist 2' },
                ],
            })

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/queue`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(res.body.currentTrack.title).toBe('Now Playing')
            expect(res.body.tracks).toHaveLength(2)
            expect(res.body.total).toBe(2)
        })

        test('returns empty queue when no state', async () => {
            authed()
            mockGetState.mockResolvedValue(null)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/queue`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(res.body.currentTrack).toBeNull()
            expect(res.body.tracks).toEqual([])
            expect(res.body.total).toBe(0)
        })
    })

    describe('POST /api/guilds/:guildId/music/queue/move', () => {
        test('returns 400 without from/to', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/queue/move`)
                .set('Cookie', SESSION_COOKIE)
                .send({ from: 0 })
                .expect(400)
        })

        test('moves track in queue', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/queue/move`)
                .set('Cookie', SESSION_COOKIE)
                .send({ from: 0, to: 2 })
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'queue_move',
                    data: { from: 0, to: 2 },
                }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/queue/remove', () => {
        test('returns 400 without index', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/queue/remove`)
                .set('Cookie', SESSION_COOKIE)
                .send({})
                .expect(400)
        })

        test('removes track from queue', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/queue/remove`)
                .set('Cookie', SESSION_COOKIE)
                .send({ index: 1 })
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'queue_remove',
                    data: { index: 1 },
                }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/queue/clear', () => {
        test('clears the queue', async () => {
            authed()
            mockSendCommand.mockResolvedValue({ success: true })

            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/queue/clear`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'queue_clear' }),
            )
        })
    })

    describe('POST /api/guilds/:guildId/music/import', () => {
        test('returns 400 without url', async () => {
            authed()
            await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/import`)
                .set('Cookie', SESSION_COOKIE)
                .send({})
                .expect(400)
        })

        test('imports playlist', async () => {
            authed()
            mockSendCommand.mockResolvedValue({
                success: true,
                tracksAdded: 15,
            })

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/music/import`)
                .set('Cookie', SESSION_COOKIE)
                .send({
                    url: 'https://open.spotify.com/playlist/abc',
                    voiceChannelId: '555',
                })
                .expect(200)

            expect(res.body.success).toBe(true)
            expect(mockSendCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'import_playlist',
                    data: expect.objectContaining({
                        url: 'https://open.spotify.com/playlist/abc',
                    }),
                }),
                30000,
            )
        })
    })
})
