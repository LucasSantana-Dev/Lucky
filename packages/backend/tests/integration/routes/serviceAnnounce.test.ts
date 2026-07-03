import {
    describe,
    test,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupServiceAnnounceRoutes } from '../../../src/routes/serviceAnnounce'
import { errorHandler } from '../../../src/middleware/errorHandler'
import bodyParser from 'body-parser'

describe('Service Announce Routes Integration', () => {
    let app: express.Express
    let originalEnv: NodeJS.ProcessEnv

    beforeEach(() => {
        originalEnv = { ...process.env }
        process.env.LUCKY_ANNOUNCE_API_KEY = 'test-announce-key'
        process.env.LUCKY_ANNOUNCE_CHANNEL_IDS =
            '895505900016631839,968982002701332610'
        process.env.DISCORD_TOKEN = 'test-bot-token'

        app = express()
        app.use(bodyParser.json())
        setupServiceAnnounceRoutes(app)
        app.use(errorHandler)

        global.fetch = jest.fn()
    })

    afterEach(() => {
        process.env = originalEnv
        jest.clearAllMocks()
    })

    describe('POST /api/service/announce', () => {
        test('should announce to allowlisted channel with valid key', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 204,
                text: async () => '',
            } as Response)

            await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test announcement',
                })
                .expect(204)

            expect(mockFetch).toHaveBeenCalledWith(
                'https://discord.com/api/v10/channels/895505900016631839/messages',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bot test-bot-token',
                    }),
                }),
            )
        })

        test('should reject with invalid key', async () => {
            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'wrong-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test announcement',
                })
                .expect(401)

            expect(response.body.error).toContain('invalid announce key')
        })

        test('should reject with missing key', async () => {
            const response = await request(app)
                .post('/api/service/announce')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test announcement',
                })
                .expect(401)

            expect(response.body.error).toContain('invalid announce key')
        })

        test('should reject channel not in allowlist', async () => {
            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '999999999',
                    content: 'Test announcement',
                })
                .expect(403)

            expect(response.body.error).toContain('not in allowlist')
        })

        test('should reject with empty allowlist', async () => {
            process.env.LUCKY_ANNOUNCE_CHANNEL_IDS = ''

            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test announcement',
                })
                .expect(403)

            expect(response.body.error).toContain('not configured')
        })

        test('should reject missing channelId', async () => {
            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    content: 'Test announcement',
                })
                .expect(400)

            expect(response.body.error).toContain('required')
        })

        test('should reject missing content and embeds', async () => {
            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                })
                .expect(400)

            expect(response.body.error).toContain('required')
        })

        test('should reject an empty embeds array with no content', async () => {
            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    embeds: [],
                })
                .expect(400)

            expect(response.body.error).toContain('required')
        })

        test('should reject whitespace-only content with no embeds', async () => {
            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: '   ',
                })
                .expect(400)

            expect(response.body.error).toContain('required')
        })

        test('should return 502 when the Discord request itself fails (network/timeout)', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockRejectedValueOnce(new Error('network unreachable'))

            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test announcement',
                })
                .expect(502)

            expect(response.body.error).toContain('discord request failed')
        })

        test('should slice content to 1900 chars', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 204,
                text: async () => '',
            } as Response)

            const longContent = 'a'.repeat(2500)
            await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: longContent,
                })
                .expect(204)

            const callArgs = mockFetch.mock.calls[0][1]
            const body = JSON.parse(callArgs?.body as string)
            expect(body.content).toHaveLength(1900)
        })

        test('should pass embeds through', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 204,
                text: async () => '',
            } as Response)

            const embeds = [
                {
                    title: 'Test Embed',
                    description: 'Test description',
                },
            ]

            await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Content with embed',
                    embeds,
                })
                .expect(204)

            const callArgs = mockFetch.mock.calls[0][1]
            const body = JSON.parse(callArgs?.body as string)
            expect(body.embeds).toEqual(embeds)
        })

        test('should return 502 on Discord API error', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            } as Response)

            const response = await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test announcement',
                })
                .expect(502)

            expect(response.body.error).toContain('discord 500')
        })

        test('should use timing-safe key comparison', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            // Two accepted-key requests below → mock one Discord response per request
            mockFetch.mockResolvedValue({
                ok: true,
                status: 204,
                text: async () => '',
            } as Response)

            // Test with exact match
            await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test',
                })
                .expect(204)

            // Test with whitespace (should be trimmed and then compared)
            await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', '  test-announce-key  ')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test',
                })
                .expect(204)

            // Test with slightly different key (timing-safe should still reject)
            await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key-wrong')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test',
                })
                .expect(401)
        })

        test('should accept a matching key even when the env var has trailing whitespace', async () => {
            process.env.LUCKY_ANNOUNCE_API_KEY = '  test-announce-key\n'
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 204,
                text: async () => '',
            } as Response)

            await request(app)
                .post('/api/service/announce')
                .set('x-announce-key', 'test-announce-key')
                .send({
                    channelId: '895505900016631839',
                    content: 'Test',
                })
                .expect(204)
        })
    })
})
