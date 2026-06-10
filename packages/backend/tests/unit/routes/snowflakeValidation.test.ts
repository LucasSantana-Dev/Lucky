import { describe, test, expect, jest } from '@jest/globals'
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
    musicControlService: {
        getState: jest.fn().mockResolvedValue(null),
        sendCommand: jest.fn().mockResolvedValue({ success: true }),
    },
    guildSettingsService: {
        getGuildSettings: jest.fn().mockResolvedValue(null),
        updateGuildSettings: jest.fn().mockResolvedValue({
            autoplayGenres: [],
        }),
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
import { setupAutoplayRoutes } from '../../../src/routes/music/autoplayRoutes'
import { setupStateRoutes } from '../../../src/routes/music/stateRoutes'
import { setupPlaybackRoutes } from '../../../src/routes/music/playbackRoutes'
import { setupQueueRoutes } from '../../../src/routes/music/queueRoutes'

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

    describe('Pagination limit bounds (#1183)', () => {
        const validGuildId = '123456789012345678'

        test.each([
            ['9999', 400],
            ['0', 400],
            ['-5', 400],
            ['abc', 400],
            ['25', 200],
        ])(
            'GET levels/leaderboard with limit=%s returns %s-class',
            async (limit, expected) => {
                const app = createApp(setupLevelsRoutes)
                const res = await request(app).get(
                    `/api/guilds/${validGuildId}/levels/leaderboard?limit=${limit}`,
                )
                if (expected === 400) {
                    expect(res.status).toBe(400)
                } else {
                    expect(res.status).not.toBe(400)
                }
            },
        )

        test.each([
            ['9999', 400],
            ['0', 400],
            ['25', 200],
        ])(
            'GET starboard/entries with limit=%s returns %s-class',
            async (limit, expected) => {
                const app = createApp(setupStarboardRoutes)
                const res = await request(app).get(
                    `/api/guilds/${validGuildId}/starboard/entries?limit=${limit}`,
                )
                if (expected === 400) {
                    expect(res.status).toBe(400)
                } else {
                    expect(res.status).not.toBe(400)
                }
            },
        )
    })

    describe('Music Routes (#1200)', () => {
        const validGuildId = '123456789012345678'
        const invalidGuildId = 'not-a-snowflake'

        type MusicRoute = {
            name: string
            setup: (app: express.Express) => void
            method: 'get' | 'post' | 'put'
            path: (guildId: string) => string
            body?: Record<string, unknown>
        }

        const routes: MusicRoute[] = [
            {
                name: 'GET autoplay/genres',
                setup: setupAutoplayRoutes,
                method: 'get',
                path: (g) => `/api/guilds/${g}/autoplay/genres`,
            },
            {
                name: 'PUT autoplay/genres',
                setup: setupAutoplayRoutes,
                method: 'put',
                path: (g) => `/api/guilds/${g}/autoplay/genres`,
                body: { genres: ['rock'] },
            },
            {
                name: 'GET music/state',
                setup: setupStateRoutes,
                method: 'get',
                path: (g) => `/api/guilds/${g}/music/state`,
            },
            {
                name: 'POST music/play',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/play`,
                body: { query: 'song' },
            },
            {
                name: 'POST music/pause',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/pause`,
            },
            {
                name: 'POST music/resume',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/resume`,
            },
            {
                name: 'POST music/skip',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/skip`,
            },
            {
                name: 'POST music/stop',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/stop`,
            },
            {
                name: 'POST music/volume',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/volume`,
                body: { volume: 50 },
            },
            {
                name: 'POST music/shuffle',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/shuffle`,
            },
            {
                name: 'POST music/repeat',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/repeat`,
                body: { mode: 'off' },
            },
            {
                name: 'POST music/seek',
                setup: setupPlaybackRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/seek`,
                body: { position: 0 },
            },
            {
                name: 'GET music/queue',
                setup: setupQueueRoutes,
                method: 'get',
                path: (g) => `/api/guilds/${g}/music/queue`,
            },
            {
                name: 'POST music/queue/move',
                setup: setupQueueRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/queue/move`,
                body: { from: 0, to: 1 },
            },
            {
                name: 'POST music/queue/remove',
                setup: setupQueueRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/queue/remove`,
                body: { index: 0 },
            },
            {
                name: 'POST music/queue/clear',
                setup: setupQueueRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/queue/clear`,
            },
            {
                name: 'POST music/import',
                setup: setupQueueRoutes,
                method: 'post',
                path: (g) => `/api/guilds/${g}/music/import`,
                body: { url: 'https://example.com/playlist' },
            },
        ]

        test.each(routes)(
            '$name rejects invalid guildId with 400',
            async ({ setup, method, path, body }) => {
                const app = createApp(setup)
                let req = request(app)[method](path(invalidGuildId))
                if (body) {
                    req = req.send(body)
                }
                const res = await req
                expect(res.status).toBe(400)
                expect(res.body).toHaveProperty('error')
            },
        )

        test.each(routes)(
            '$name accepts a valid guildId',
            async ({ setup, method, path, body }) => {
                const app = createApp(setup)
                let req = request(app)[method](path(validGuildId))
                if (body) {
                    req = req.send(body)
                }
                const res = await req
                expect(res.status).not.toBe(400)
            },
        )

        // GET music/stream is SSE — a valid request never terminates, so only
        // the rejection path is testable here.
        test('GET music/stream rejects invalid guildId with 400', async () => {
            const app = createApp(setupStateRoutes)
            const res = await request(app).get(
                `/api/guilds/${invalidGuildId}/music/stream`,
            )
            expect(res.status).toBe(400)
            expect(res.body).toHaveProperty('error')
        })
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
