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
import { setupServiceGuildRoutes } from '../../../src/routes/serviceGuild'
import { errorHandler } from '../../../src/middleware/errorHandler'
import bodyParser from 'body-parser'

describe('Service Guild Routes Integration', () => {
    let app: express.Express
    let originalEnv: NodeJS.ProcessEnv

    beforeEach(() => {
        originalEnv = { ...process.env }
        process.env.LUCKY_MEMBERS_API_KEY = 'test-members-key'
        process.env.CRIATIVARIA_GUILD_ID = '895505900016631839'
        process.env.DISCORD_TOKEN = 'test-bot-token'

        app = express()
        app.use(bodyParser.json())
        setupServiceGuildRoutes(app)
        app.use(errorHandler)

        global.fetch = jest.fn()
    })

    afterEach(() => {
        process.env = originalEnv
        jest.clearAllMocks()
    })

    describe('GET /api/service/guild/members', () => {
        test('should list members with valid key', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        user: {
                            id: '123456789',
                            username: 'testuser',
                            global_name: 'Test User',
                            avatar: 'abc123',
                        },
                        nick: 'TestNick',
                        roles: ['role1', 'role2'],
                        joined_at: '2024-01-01T00:00:00Z',
                    },
                ],
            } as Response)

            const res = await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            expect(res.body.members).toHaveLength(1)
            expect(res.body.members[0]).toEqual({
                id: '123456789',
                username: 'testuser',
                globalName: 'Test User',
                nick: 'TestNick',
                avatar: 'abc123',
                roles: ['role1', 'role2'],
                joinedAt: '2024-01-01T00:00:00Z',
            })
            // Ensure no raw user object leakage
            expect(res.body.members[0]).not.toHaveProperty('user')
        })

        test('should reject with invalid key', async () => {
            const response = await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', 'wrong-key')
                .expect(401)

            expect(response.body.error).toContain('invalid members key')
        })

        test('should reject with missing key', async () => {
            const response = await request(app)
                .get('/api/service/guild/members')
                .expect(401)

            expect(response.body.error).toContain('invalid members key')
        })

        test('should accept query parameter for member search', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [],
            } as Response)

            await request(app)
                .get('/api/service/guild/members?query=test')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            const callUrl = mockFetch.mock.calls[0][0] as string
            expect(callUrl).toContain('/members/search')
            expect(callUrl).toContain('query=test')
        })

        test('should call members/search when query is provided', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [],
            } as Response)

            await request(app)
                .get('/api/service/guild/members?query=alice&limit=10')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            const callUrl = mockFetch.mock.calls[0][0] as string
            expect(callUrl).toContain('/members/search')
            expect(callUrl).toContain('query=alice')
            expect(callUrl).toContain('limit=10')
        })

        test('should call regular list endpoint when no query', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [],
            } as Response)

            await request(app)
                .get(
                    '/api/service/guild/members?limit=25&after=12345678901234567',
                )
                .set('x-members-key', 'test-members-key')
                .expect(200)

            const callUrl = mockFetch.mock.calls[0][0] as string
            expect(callUrl).toContain('/members?')
            expect(callUrl).toContain('limit=25')
            expect(callUrl).toContain('after=12345678901234567')
        })

        test('should reject invalid after snowflake', async () => {
            const response = await request(app)
                .get('/api/service/guild/members?after=invalid')
                .set('x-members-key', 'test-members-key')
                .expect(400)

            expect(response.body.error).toContain('invalid after snowflake')
        })

        test('should reject limit outside 1-100 range', async () => {
            const response = await request(app)
                .get('/api/service/guild/members?limit=101')
                .set('x-members-key', 'test-members-key')
                .expect(400)

            expect(response.body.error).toContain('limit must be 1-100')
        })

        test('should reject limit=0', async () => {
            const response = await request(app)
                .get('/api/service/guild/members?limit=0')
                .set('x-members-key', 'test-members-key')
                .expect(400)

            expect(response.body.error).toContain('limit must be 1-100')
        })

        test('should reject non-numeric limit', async () => {
            const response = await request(app)
                .get('/api/service/guild/members?limit=abc')
                .set('x-members-key', 'test-members-key')
                .expect(400)

            expect(response.body.error).toContain('limit must be 1-100')
        })

        test('should reject query outside 1-32 character range', async () => {
            const response = await request(app)
                .get('/api/service/guild/members?query=' + 'a'.repeat(33))
                .set('x-members-key', 'test-members-key')
                .expect(400)

            expect(response.body.error).toContain(
                'query must be 1-32 characters',
            )
        })

        test('should sanitize control characters from query', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [],
            } as Response)

            await request(app)
                .get('/api/service/guild/members?query=test%00%01user')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            const callUrl = mockFetch.mock.calls[0][0] as string
            // Control chars should be stripped
            expect(callUrl).toContain('query=testuser')
        })

        test('should return 502 on Discord API error', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Server error' }),
            } as Response)

            const response = await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', 'test-members-key')
                .expect(502)

            expect(response.body.error).toContain('discord 500')
        })

        test('should default limit to 50', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [],
            } as Response)

            await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            const callUrl = mockFetch.mock.calls[0][0] as string
            expect(callUrl).toContain('limit=50')
        })

        test('should map globalName to null when not provided', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        user: {
                            id: '123456789',
                            username: 'testuser',
                            global_name: null,
                            avatar: null,
                        },
                        nick: null,
                        roles: [],
                        joined_at: '2024-01-01T00:00:00Z',
                    },
                ],
            } as Response)

            const res = await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            expect(res.body.members[0].globalName).toBeNull()
            expect(res.body.members[0].nick).toBeNull()
            expect(res.body.members[0].avatar).toBeNull()
        })

        test('should use timing-safe key comparison', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => [],
            } as Response)

            // Exact match
            await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            // With whitespace (trimmed)
            await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', '  test-members-key  ')
                .expect(200)

            // Wrong key
            await request(app)
                .get('/api/service/guild/members')
                .set('x-members-key', 'test-members-key-wrong')
                .expect(401)
        })
    })

    describe('GET /api/service/guild/roles', () => {
        test('should list roles with valid key', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        id: 'role1',
                        name: 'Admin',
                        color: 0xff0000,
                        position: 10,
                        hoist: true,
                    },
                    {
                        id: 'role2',
                        name: 'Member',
                        color: 0x00ff00,
                        position: 5,
                        hoist: false,
                    },
                ],
            } as Response)

            const res = await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            expect(res.body.roles).toHaveLength(2)
            // Should be sorted by position descending
            expect(res.body.roles[0].position).toBe(10)
            expect(res.body.roles[1].position).toBe(5)
        })

        test('should sort roles by position descending', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        id: 'role1',
                        name: 'Low',
                        color: 0,
                        position: 1,
                        hoist: false,
                    },
                    {
                        id: 'role2',
                        name: 'High',
                        color: 0,
                        position: 100,
                        hoist: false,
                    },
                    {
                        id: 'role3',
                        name: 'Mid',
                        color: 0,
                        position: 50,
                        hoist: false,
                    },
                ],
            } as Response)

            const res = await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            expect(res.body.roles[0].position).toBe(100)
            expect(res.body.roles[1].position).toBe(50)
            expect(res.body.roles[2].position).toBe(1)
        })

        test('should reject with invalid key', async () => {
            const response = await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', 'wrong-key')
                .expect(401)

            expect(response.body.error).toContain('invalid members key')
        })

        test('should reject with missing key', async () => {
            const response = await request(app)
                .get('/api/service/guild/roles')
                .expect(401)

            expect(response.body.error).toContain('invalid members key')
        })

        test('should return 502 on Discord API error', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 503,
                json: async () => ({ error: 'Service unavailable' }),
            } as Response)

            const response = await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', 'test-members-key')
                .expect(502)

            expect(response.body.error).toContain('discord 503')
        })

        test('should include only mapped role fields', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [
                    {
                        id: 'role1',
                        name: 'Admin',
                        color: 0xff0000,
                        position: 10,
                        hoist: true,
                        managed: true,
                        mentionable: true,
                        tags: {},
                        icon: 'icon123',
                    },
                ],
            } as Response)

            const res = await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            const role = res.body.roles[0]
            expect(role).toEqual({
                id: 'role1',
                name: 'Admin',
                color: 0xff0000,
                position: 10,
                hoist: true,
            })
            expect(role).not.toHaveProperty('managed')
            expect(role).not.toHaveProperty('mentionable')
            expect(role).not.toHaveProperty('tags')
            expect(role).not.toHaveProperty('icon')
        })

        test('should use timing-safe key comparison', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => [],
            } as Response)

            // Exact match
            await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            // With whitespace (trimmed)
            await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', '  test-members-key  ')
                .expect(200)

            // Wrong key
            await request(app)
                .get('/api/service/guild/roles')
                .set('x-members-key', 'test-members-key-wrong')
                .expect(401)
        })
    })

    describe('GET /api/service/guild/members/:userId', () => {
        test('should return a single member with valid key', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    user: {
                        id: '123456789012345678',
                        username: 'testuser',
                        global_name: 'Test User',
                        avatar: 'abc123',
                    },
                    nick: 'TestNick',
                    roles: ['role1', 'role2'],
                    joined_at: '2024-01-01T00:00:00Z',
                }),
            } as Response)

            const res = await request(app)
                .get('/api/service/guild/members/123456789012345678')
                .set('x-members-key', 'test-members-key')
                .expect(200)

            expect(res.body.member).toEqual({
                id: '123456789012345678',
                username: 'testuser',
                globalName: 'Test User',
                nick: 'TestNick',
                avatar: 'abc123',
                roles: ['role1', 'role2'],
                joinedAt: '2024-01-01T00:00:00Z',
            })
            expect(res.body.member).not.toHaveProperty('user')
        })

        test('should reject with invalid key', async () => {
            const response = await request(app)
                .get('/api/service/guild/members/123456789012345678')
                .set('x-members-key', 'wrong-key')
                .expect(401)

            expect(response.body.error).toContain('invalid members key')
        })

        test('should reject a non-snowflake user id', async () => {
            const response = await request(app)
                .get('/api/service/guild/members/not-an-id')
                .set('x-members-key', 'test-members-key')
                .expect(400)

            expect(response.body.error).toContain('invalid user id')
        })

        test('should return 404 when Discord reports the member missing', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({}),
            } as Response)

            const response = await request(app)
                .get('/api/service/guild/members/123456789012345678')
                .set('x-members-key', 'test-members-key')
                .expect(404)

            expect(response.body.error).toContain('member not found')
        })

        test('should return 502 on other Discord errors', async () => {
            const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({}),
            } as Response)

            const response = await request(app)
                .get('/api/service/guild/members/123456789012345678')
                .set('x-members-key', 'test-members-key')
                .expect(502)

            expect(response.body.error).toContain('discord 500')
        })
    })
})
