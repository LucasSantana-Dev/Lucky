import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupInternalNotifyRoutes } from '../../../src/routes/internalNotify'
import { errorHandler } from '../../../src/middleware/errorHandler'

const API_KEY = 'test-notify-api-key-12345'
const DISCORD_TOKEN = 'test-bot-token'
const CHANNEL_ID = '123456789012345678'

describe('Internal Notify Routes Integration', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupInternalNotifyRoutes(app)
        app.use(errorHandler)

        jest.clearAllMocks()
        process.env.LUCKY_NOTIFY_API_KEY = API_KEY
        process.env.DISCORD_TOKEN = DISCORD_TOKEN

        global.fetch = jest.fn()
    })

    describe('POST /api/internal/notify', () => {
        test('should send message with content and return 204', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue(''),
            } as any)

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(204)
            expect(mockFetch).toHaveBeenCalledWith(
                `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        Authorization: `Bot ${DISCORD_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                }),
            )
        })

        test('should send message with embeds and return 204', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue(''),
            } as any)

            const embed = {
                title: 'Test Embed',
                description: 'Test description',
                color: 3447003,
            }

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    embeds: [embed],
                })

            expect(response.status).toBe(204)
            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining(JSON.stringify(embed)),
                }),
            )
        })

        test('should truncate content to 1900 chars', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue(''),
            } as any)

            const longContent = 'x'.repeat(2500)

            await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: longContent,
                })

            const callArgs = mockFetch.mock.calls[0]
            const bodyStr = callArgs[1]?.body as string
            const body = JSON.parse(bodyStr)

            expect(body.content).toBe('x'.repeat(1900))
            expect(body.content.length).toBe(1900)
        })

        test('should reject requests without api key', async () => {
            const response = await request(app)
                .post('/api/internal/notify')
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(401)
            expect(response.body.error).toContain('invalid notify key')
        })

        test('should reject requests with wrong api key', async () => {
            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', 'wrong-key')
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(401)
            expect(response.body.error).toContain('invalid notify key')
        })

        test('should reject request when api key not configured', async () => {
            delete process.env.LUCKY_NOTIFY_API_KEY

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', 'any-key')
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(401)
        })

        test('should return 400 when channelId is missing', async () => {
            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    content: 'Test message',
                })

            expect(response.status).toBe(400)
            expect(response.body.error).toContain('channelId')
        })

        test('should return 400 when both content and embeds are missing', async () => {
            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                })

            expect(response.status).toBe(400)
            expect(response.body.error).toContain(
                'content|embeds required',
            )
        })

        test('should accept empty body object', async () => {
            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({})

            expect(response.status).toBe(400)
            expect(response.body.error).toContain('channelId')
        })

        test('should return 500 when Discord token is missing', async () => {
            delete process.env.DISCORD_TOKEN

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(500)
            expect(response.body.error).toContain('bot token missing')
        })

        test('should return 502 when Discord API returns error', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: false,
                status: 403,
                text: jest.fn().mockResolvedValue('Forbidden'),
            } as any)

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(502)
            expect(response.body.error).toContain('discord 403')
        })

        test('should handle Discord API 404 error', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                text: jest.fn().mockResolvedValue('Not Found'),
            } as any)

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(502)
            expect(response.body.error).toContain('discord 404')
        })

        test('should handle Discord API network error gracefully', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: jest.fn().mockResolvedValue('Internal Server Error'),
            } as any)

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(502)
            expect(response.body.error).toContain('discord 500')
        })

        test('should handle fetch text parsing error', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: jest
                    .fn()
                    .mockRejectedValue(new Error('Parse error')),
            } as any)

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test message',
                })

            expect(response.status).toBe(502)
            expect(response.body.error).toContain('discord 500')
        })

        test('should send both content and embeds when provided', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue(''),
            } as any)

            const embed = { title: 'Embed', color: 16711680 }

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Message with embed',
                    embeds: [embed],
                })

            expect(response.status).toBe(204)

            const callArgs = mockFetch.mock.calls[0]
            const bodyStr = callArgs[1]?.body as string
            const body = JSON.parse(bodyStr)

            expect(body.content).toBe('Message with embed')
            expect(body.embeds).toEqual([embed])
        })

        test('should use correct Discord API endpoint', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue(''),
            } as any)

            await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: 'Test',
                })

            expect(mockFetch).toHaveBeenCalledWith(
                'https://discord.com/api/v10/channels/123456789012345678/messages',
                expect.any(Object),
            )
        })

        test('should accept content with special characters', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<
                typeof fetch
            >
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue(''),
            } as any)

            const specialContent = '🎵 Now playing: "Test" [Explicit] \n\n'

            const response = await request(app)
                .post('/api/internal/notify')
                .set('x-notify-key', API_KEY)
                .send({
                    channelId: CHANNEL_ID,
                    content: specialContent,
                })

            expect(response.status).toBe(204)

            const callArgs = mockFetch.mock.calls[0]
            const bodyStr = callArgs[1]?.body as string
            const body = JSON.parse(bodyStr)

            expect(body.content).toBe(specialContent)
        })
    })
})
