import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupStarboardRoutes } from '../../../src/routes/starboard'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockGetConfig = jest.fn<any>()
const mockUpsertConfig = jest.fn<any>()
const mockDeleteConfig = jest.fn<any>()
const mockGetTopEntries = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    starboardService: {
        getConfig: (...args: any[]) => mockGetConfig(...args),
        upsertConfig: (...args: any[]) => mockUpsertConfig(...args),
        deleteConfig: (...args: any[]) => mockDeleteConfig(...args),
        getTopEntries: (...args: any[]) => mockGetTopEntries(...args),
    },
}))

describe('Starboard Routes', () => {
    let app: express.Express

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    }

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupStarboardRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('GET /api/guilds/:guildId/starboard/config', () => {
        test('should return starboard config when it exists', async () => {
            authed()

            const mockConfig = {
                id: 'cfg1',
                guildId: GUILD_ID,
                channelId: '222222222222222222',
                emoji: '⭐',
                threshold: 3,
                selfStar: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            mockGetConfig.mockResolvedValue(mockConfig)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/config`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.config).toMatchObject({
                id: 'cfg1',
                guildId: GUILD_ID,
                channelId: '222222222222222222',
                emoji: '⭐',
                threshold: 3,
                selfStar: false,
            })
            expect(mockGetConfig).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return null config when it does not exist', async () => {
            authed()
            mockGetConfig.mockResolvedValue(null)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/config`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.config).toBeNull()
            expect(mockGetConfig).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return 401 without authentication', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/starboard/config`,
            )

            expect(res.status).toBe(401)
        })

        test('should reject invalid guildId parameter', async () => {
            authed()

            const res = await request(app)
                .get('/api/guilds/invalid-id/starboard/config')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })
    })

    describe('PATCH /api/guilds/:guildId/starboard/config', () => {
        test('should create config when channelId is provided', async () => {
            authed()

            const newConfig = {
                id: 'cfg1',
                guildId: GUILD_ID,
                channelId: '222222222222222222',
                emoji: '⭐',
                threshold: 5,
                selfStar: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            mockUpsertConfig.mockResolvedValue(newConfig)

            const res = await request(app)
                .patch(`/api/guilds/${GUILD_ID}/starboard/config`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    channelId: '222222222222222222',
                    emoji: '⭐',
                    threshold: 5,
                    selfStar: true,
                })

            expect(res.status).toBe(200)
            expect(res.body.config).toMatchObject({
                id: 'cfg1',
                guildId: GUILD_ID,
                channelId: '222222222222222222',
                emoji: '⭐',
                threshold: 5,
                selfStar: true,
            })
            expect(mockUpsertConfig).toHaveBeenCalledWith(
                GUILD_ID,
                expect.objectContaining({
                    channelId: '222222222222222222',
                    emoji: '⭐',
                    threshold: 5,
                    selfStar: true,
                }),
            )
        })

        test('should update config using existing channelId when not provided', async () => {
            authed()

            const existingConfig = {
                id: 'cfg1',
                guildId: GUILD_ID,
                channelId: '222222222222222222',
                emoji: '⭐',
                threshold: 3,
                selfStar: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const updatedConfig = {
                ...existingConfig,
                threshold: 5,
                emoji: '🌟',
            }

            mockGetConfig.mockResolvedValue(existingConfig)
            mockUpsertConfig.mockResolvedValue(updatedConfig)

            const res = await request(app)
                .patch(`/api/guilds/${GUILD_ID}/starboard/config`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    emoji: '🌟',
                    threshold: 5,
                })

            expect(res.status).toBe(200)
            expect(res.body.config).toMatchObject({
                id: 'cfg1',
                guildId: GUILD_ID,
                channelId: '222222222222222222',
                emoji: '🌟',
                threshold: 5,
                selfStar: false,
            })
            expect(mockUpsertConfig).toHaveBeenCalledWith(
                GUILD_ID,
                expect.objectContaining({
                    channelId: '222222222222222222',
                    emoji: '🌟',
                    threshold: 5,
                }),
            )
        })

        test('should reject PATCH without channelId when no existing config', async () => {
            authed()
            mockGetConfig.mockResolvedValue(null)

            const res = await request(app)
                .patch(`/api/guilds/${GUILD_ID}/starboard/config`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    emoji: '⭐',
                    threshold: 3,
                })

            expect(res.status).toBe(400)
            expect(res.body.error).toContain('channelId is required')
        })

        test('should reject invalid body', async () => {
            authed()

            const res = await request(app)
                .patch(`/api/guilds/${GUILD_ID}/starboard/config`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    threshold: 'invalid',
                })

            expect(res.status).toBe(400)
        })

        test('should return 401 without authentication', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app)
                .patch(`/api/guilds/${GUILD_ID}/starboard/config`)
                .send({
                    channelId: '222222222222222222',
                })

            expect(res.status).toBe(401)
        })
    })

    describe('DELETE /api/guilds/:guildId/starboard/config', () => {
        test('should delete starboard config', async () => {
            authed()
            mockDeleteConfig.mockResolvedValue()

            const res = await request(app)
                .delete(`/api/guilds/${GUILD_ID}/starboard/config`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockDeleteConfig).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return 401 without authentication', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).delete(
                `/api/guilds/${GUILD_ID}/starboard/config`,
            )

            expect(res.status).toBe(401)
        })

        test('should reject invalid guildId parameter', async () => {
            authed()

            const res = await request(app)
                .delete('/api/guilds/invalid-id/starboard/config')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })
    })

    describe('GET /api/guilds/:guildId/starboard/entries', () => {
        test('should return top entries with default limit', async () => {
            authed()

            const entries = [
                {
                    id: 'e1',
                    guildId: GUILD_ID,
                    messageId: 'msg1',
                    channelId: '222222222222222222',
                    authorId: '333333333333333333',
                    starboardMsgId: 'sbmsg1',
                    starCount: 10,
                    content: 'First message',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'e2',
                    guildId: GUILD_ID,
                    messageId: 'msg2',
                    channelId: '222222222222222222',
                    authorId: '333333333333333333',
                    starboardMsgId: 'sbmsg2',
                    starCount: 5,
                    content: 'Second message',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]
            mockGetTopEntries.mockResolvedValue(entries)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/entries`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.entries).toHaveLength(2)
            expect(mockGetTopEntries).toHaveBeenCalledWith(GUILD_ID, 10)
        })

        test('should respect custom limit parameter', async () => {
            authed()

            const entries = Array.from({ length: 25 }, (_, i) => ({
                id: `e${i}`,
                guildId: GUILD_ID,
                messageId: `msg${i}`,
                channelId: '222222222222222222',
                authorId: '333333333333333333',
                starboardMsgId: `sbmsg${i}`,
                starCount: 25 - i,
                content: `Message ${i}`,
                createdAt: new Date(),
                updatedAt: new Date(),
            }))
            mockGetTopEntries.mockResolvedValue(entries)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/entries`)
                .query({ limit: 25 })
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.entries).toHaveLength(25)
            expect(mockGetTopEntries).toHaveBeenCalledWith(GUILD_ID, 25)
        })

        test('should clamp limit to maximum of 50', async () => {
            authed()
            mockGetTopEntries.mockResolvedValue([])

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/entries`)
                .query({ limit: 50 })
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(mockGetTopEntries).toHaveBeenCalledWith(GUILD_ID, 50)
        })

        test('should reject limit greater than 50', async () => {
            authed()

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/entries`)
                .query({ limit: 100 })
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })

        test('should reject invalid limit in query', async () => {
            authed()

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/entries`)
                .query({ limit: 'invalid' })
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })

        test('should reject limit less than 1', async () => {
            authed()

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/entries`)
                .query({ limit: 0 })
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })

        test('should return 401 without authentication', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/starboard/entries`,
            )

            expect(res.status).toBe(401)
        })

        test('should reject invalid guildId parameter', async () => {
            authed()

            const res = await request(app)
                .get('/api/guilds/invalid-id/starboard/entries')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })

        test('should return empty array when no entries exist', async () => {
            authed()
            mockGetTopEntries.mockResolvedValue([])

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/starboard/entries`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.entries).toEqual([])
        })
    })
})
