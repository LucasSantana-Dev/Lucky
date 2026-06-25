import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import express from 'express'
import request from 'supertest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFindUnique = jest.fn<any>()

jest.mock('@lucky/shared/utils', () => {
    const actual = jest.requireActual('@lucky/shared/utils') as object
    return {
        ...actual,
        getPrismaClient: jest.fn(() => ({
            guildForumThread: {
                findUnique: mockFindUnique,
            },
        })),
    }
})

jest.mock('../../../src/middleware/rateLimit', () => ({
    apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { setupForumsRoutes } from '../../../src/routes/forums'

function buildApp() {
    const app = express()
    setupForumsRoutes(app)
    return app
}

const GUILD_ID = '895505900016631839'
const SLUG = 'linkedin-de-um-curriculo-parado-para-uma-landing-page-de-aut'

describe('GET /api/guilds/:guildId/threads/:slug', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('returns 200 with thread data when found', async () => {
        mockFindUnique.mockResolvedValueOnce({
            threadId: '123456789',
            slug: SLUG,
            title: 'LinkedIn: de um currículo parado para uma landing page de aut.',
            archived: false,
        })

        const res = await request(buildApp()).get(
            `/api/guilds/${GUILD_ID}/threads/${SLUG}`,
        )

        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({
            threadId: '123456789',
            slug: SLUG,
            title: 'LinkedIn: de um currículo parado para uma landing page de aut.',
            archived: false,
            url: `https://discord.com/channels/${GUILD_ID}/123456789`,
        })
    })

    test('returns 404 when thread not found', async () => {
        mockFindUnique.mockResolvedValueOnce(null)

        const res = await request(buildApp()).get(
            `/api/guilds/${GUILD_ID}/threads/nonexistent-slug`,
        )

        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'Thread not found' })
    })

    test('queries by guildId and slug composite key', async () => {
        mockFindUnique.mockResolvedValueOnce(null)

        await request(buildApp()).get(`/api/guilds/${GUILD_ID}/threads/${SLUG}`)

        expect(mockFindUnique).toHaveBeenCalledWith({
            where: { guildId_slug: { guildId: GUILD_ID, slug: SLUG } },
            select: expect.any(Object),
        })
    })

    test('sets Cache-Control header on hit', async () => {
        mockFindUnique.mockResolvedValueOnce({
            threadId: '999',
            slug: SLUG,
            title: 'Title',
            archived: false,
        })

        const res = await request(buildApp()).get(
            `/api/guilds/${GUILD_ID}/threads/${SLUG}`,
        )

        expect(res.headers['cache-control']).toContain('public')
        expect(res.headers['cache-control']).toContain('max-age=60')
    })

    test('constructs correct Discord thread URL', async () => {
        mockFindUnique.mockResolvedValueOnce({
            threadId: 'THREAD_XYZ',
            slug: SLUG,
            title: 'Any Title',
            archived: true,
        })

        const res = await request(buildApp()).get(
            `/api/guilds/${GUILD_ID}/threads/${SLUG}`,
        )

        expect(res.body.url).toBe(
            `https://discord.com/channels/${GUILD_ID}/THREAD_XYZ`,
        )
    })

    test('returns 400 when guildId is malformed (not a snowflake)', async () => {
        const res = await request(buildApp()).get(
            `/api/guilds/invalid-guild-id/threads/${SLUG}`,
        )

        expect(res.status).toBe(400)
        expect(res.body).toHaveProperty('error', 'Validation failed')
        expect(mockFindUnique).not.toHaveBeenCalled()
    })

    test('returns 404 when slug is missing', async () => {
        const res = await request(buildApp()).get(
            `/api/guilds/${GUILD_ID}/threads/`,
        )

        expect(res.status).toBe(404)
    })
})
