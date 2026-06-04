import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { Request, Response, NextFunction } from 'express'

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (req: Request, _res: Response, next: NextFunction) => {
        ;(req as any).sessionId = 'session-123'
        ;(req as any).userId = '123456789012345678'
        next()
    },
}))

jest.mock('../../../src/middleware/guildAccess', () => ({
    requireGuildModuleAccess:
        () => (_req: Request, _res: Response, next: NextFunction) => {
            next()
        },
}))

jest.mock('@lucky/shared/services', () => ({
    starboardService: {
        getConfig: jest.fn().mockResolvedValue(null),
        upsertConfig: jest.fn().mockResolvedValue({ channelId: '123' }),
        deleteConfig: jest.fn().mockResolvedValue({}),
        getTopEntries: jest.fn().mockResolvedValue([]),
    },
    levelService: {
        getConfig: jest.fn().mockResolvedValue(null),
        upsertConfig: jest.fn().mockResolvedValue({ enabled: false }),
        getLeaderboard: jest.fn().mockResolvedValue([]),
        getMemberXP: jest.fn().mockResolvedValue(null),
        getRank: jest.fn().mockResolvedValue(null),
        getRewards: jest.fn().mockResolvedValue([]),
        addReward: jest.fn().mockResolvedValue({}),
        removeReward: jest.fn().mockResolvedValue({}),
    },
}))

jest.mock('../../../src/services/GuildService', () => ({
    guildService: {
        generateBotInviteUrl: jest
            .fn()
            .mockReturnValue('https://discord.com/oauth2/authorize'),
        getGuildTextChannelOptions: jest.fn().mockResolvedValue([]),
    },
}))

jest.mock('../../../src/services/GuildAccessService', () => ({
    guildAccessService: {
        listAuthorizedGuilds: jest.fn().mockResolvedValue([]),
        resolveGuildContext: jest.fn().mockResolvedValue({
            nickname: 'test',
            roleIds: [],
            effectiveAccess: 'owner',
            canManageRbac: true,
        }),
    },
}))

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn().mockResolvedValue({
            user: { username: 'test', global_name: 'Test User' },
        }),
    },
}))

import express from 'express'
import request from 'supertest'
import { setupStarboardRoutes } from '../../../src/routes/starboard'
import { setupLevelsRoutes } from '../../../src/routes/levels'
import { setupGuildRoutes } from '../../../src/routes/guilds'

function createApp(setupRoutes: (app: express.Express) => void) {
    const app = express()
    app.use(express.json())
    setupRoutes(app)
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        res.status(err.statusCode ?? 500).json({ error: err.message })
    })
    return app
}

describe('Guild ID Snowflake Validation', () => {
    describe('Starboard Routes', () => {
        const validGuildId = '123456789012345678'
        const validGuildId17 = '12345678901234567' // 17 digits - valid per Discord snowflakes
        const invalidGuildIds = [
            'invalid',
            '123', // too short
            'not-a-number',
            'abc123def456ghi789',
            '123456789012345678901', // 21 digits (too long)
            'guild-id',
        ]

        test('GET /api/guilds/:guildId/starboard/config with valid guildId succeeds', async () => {
            const app = createApp(setupStarboardRoutes)
            const res = await request(app).get(
                `/api/guilds/${validGuildId}/starboard/config`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'GET /api/guilds/:guildId/starboard/config rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupStarboardRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidGuildId}/starboard/config`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('PATCH /api/guilds/:guildId/starboard/config with valid guildId succeeds', async () => {
            const app = createApp(setupStarboardRoutes)
            const res = await request(app)
                .patch(`/api/guilds/${validGuildId}/starboard/config`)
                .send({ channelId: validGuildId })
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'PATCH /api/guilds/:guildId/starboard/config rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupStarboardRoutes)
                const res = await request(app)
                    .patch(`/api/guilds/${invalidGuildId}/starboard/config`)
                    .send({ channelId: validGuildId })
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('DELETE /api/guilds/:guildId/starboard/config with valid guildId succeeds', async () => {
            const app = createApp(setupStarboardRoutes)
            const res = await request(app).delete(
                `/api/guilds/${validGuildId}/starboard/config`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'DELETE /api/guilds/:guildId/starboard/config rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupStarboardRoutes)
                const res = await request(app).delete(
                    `/api/guilds/${invalidGuildId}/starboard/config`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('GET /api/guilds/:guildId/starboard/entries with valid guildId succeeds', async () => {
            const app = createApp(setupStarboardRoutes)
            const res = await request(app).get(
                `/api/guilds/${validGuildId}/starboard/entries`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'GET /api/guilds/:guildId/starboard/entries rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupStarboardRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidGuildId}/starboard/entries`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )
    })

    describe('Levels Routes', () => {
        const validGuildId = '123456789012345678'
        const validUserId = '987654321098765432'
        const invalidGuildIds = [
            'invalid',
            '123', // too short
            'not-a-number',
            'abc123def456ghi789',
            '123456789012345678901', // 21 digits (too long)
            'guild-id',
        ]
        const invalidUserIds = [
            'invalid',
            '123', // too short
            'not-a-number',
        ]

        test('GET /api/guilds/:guildId/levels/config with valid guildId succeeds', async () => {
            const app = createApp(setupLevelsRoutes)
            const res = await request(app).get(
                `/api/guilds/${validGuildId}/levels/config`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'GET /api/guilds/:guildId/levels/config rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidGuildId}/levels/config`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('PATCH /api/guilds/:guildId/levels/config with valid guildId succeeds', async () => {
            const app = createApp(setupLevelsRoutes)
            const res = await request(app)
                .patch(`/api/guilds/${validGuildId}/levels/config`)
                .send({ enabled: true })
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'PATCH /api/guilds/:guildId/levels/config rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app)
                    .patch(`/api/guilds/${invalidGuildId}/levels/config`)
                    .send({ enabled: true })
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('GET /api/guilds/:guildId/levels/leaderboard with valid guildId succeeds', async () => {
            const app = createApp(setupLevelsRoutes)
            const res = await request(app).get(
                `/api/guilds/${validGuildId}/levels/leaderboard`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'GET /api/guilds/:guildId/levels/leaderboard rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidGuildId}/levels/leaderboard`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('GET /api/guilds/:guildId/levels/rank/:userId with valid IDs succeeds', async () => {
            const app = createApp(setupLevelsRoutes)
            const res = await request(app).get(
                `/api/guilds/${validGuildId}/levels/rank/${validUserId}`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'GET /api/guilds/:guildId/levels/rank/:userId rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidGuildId}/levels/rank/${validUserId}`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test.each(invalidUserIds)(
            'GET /api/guilds/:guildId/levels/rank/:userId rejects invalid userId: %s',
            async (invalidUserId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app).get(
                    `/api/guilds/${validGuildId}/levels/rank/${invalidUserId}`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('GET /api/guilds/:guildId/levels/rewards with valid guildId succeeds', async () => {
            const app = createApp(setupLevelsRoutes)
            const res = await request(app).get(
                `/api/guilds/${validGuildId}/levels/rewards`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'GET /api/guilds/:guildId/levels/rewards rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidGuildId}/levels/rewards`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('POST /api/guilds/:guildId/levels/rewards with valid guildId succeeds', async () => {
            const app = createApp(setupLevelsRoutes)
            const res = await request(app)
                .post(`/api/guilds/${validGuildId}/levels/rewards`)
                .send({ level: 1, roleId: validGuildId })
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'POST /api/guilds/:guildId/levels/rewards rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app)
                    .post(`/api/guilds/${invalidGuildId}/levels/rewards`)
                    .send({ level: 1, roleId: validGuildId })
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('DELETE /api/guilds/:guildId/levels/rewards/:level with valid IDs succeeds', async () => {
            const app = createApp(setupLevelsRoutes)
            const res = await request(app).delete(
                `/api/guilds/${validGuildId}/levels/rewards/1`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidGuildIds)(
            'DELETE /api/guilds/:guildId/levels/rewards/:level rejects invalid guildId: %s',
            async (invalidGuildId) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app).delete(
                    `/api/guilds/${invalidGuildId}/levels/rewards/1`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )
    })

    describe('Guilds Routes', () => {
        const validId = '123456789012345678'
        const validGuildId = '123456789012345678'
        const invalidIds = [
            'invalid',
            '123', // too short
            'not-a-number',
            'abc123def456ghi789',
            '123456789012345678901', // 21 digits (too long)
            'guild-id',
        ]

        test('GET /api/guilds/:id with valid id succeeds', async () => {
            const app = createApp(setupGuildRoutes)
            const res = await request(app).get(`/api/guilds/${validId}`)
            expect(res.status).not.toBe(400)
        })

        test.each(invalidIds)(
            'GET /api/guilds/:id rejects invalid id: %s',
            async (invalidId) => {
                const app = createApp(setupGuildRoutes)
                const res = await request(app).get(`/api/guilds/${invalidId}`)
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('GET /api/guilds/:id/invite with valid id succeeds', async () => {
            const app = createApp(setupGuildRoutes)
            const res = await request(app).get(`/api/guilds/${validId}/invite`)
            expect(res.status).not.toBe(400)
        })

        test.each(invalidIds)(
            'GET /api/guilds/:id/invite rejects invalid id: %s',
            async (invalidId) => {
                const app = createApp(setupGuildRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidId}/invite`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('GET /api/guilds/:id/me with valid id succeeds', async () => {
            const app = createApp(setupGuildRoutes)
            const res = await request(app).get(`/api/guilds/${validId}/me`)
            expect(res.status).not.toBe(400)
        })

        test.each(invalidIds)(
            'GET /api/guilds/:id/me rejects invalid id: %s',
            async (invalidId) => {
                const app = createApp(setupGuildRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidId}/me`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test('GET /api/guilds/:guildId/channels with valid guildId succeeds', async () => {
            const app = createApp(setupGuildRoutes)
            const res = await request(app).get(
                `/api/guilds/${validGuildId}/channels`,
            )
            expect(res.status).not.toBe(400)
        })

        test.each(invalidIds)(
            'GET /api/guilds/:guildId/channels rejects invalid guildId: %s',
            async (invalidId) => {
                const app = createApp(setupGuildRoutes)
                const res = await request(app).get(
                    `/api/guilds/${invalidId}/channels`,
                )
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )
    })
})
