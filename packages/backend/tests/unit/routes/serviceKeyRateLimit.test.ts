import { afterEach, describe, expect, it, jest } from '@jest/globals'
import express, { type Express } from 'express'
import request from 'supertest'

// tests/setup.ts swaps the limiters for passthroughs. These routes are
// mounted before the shared /api limiter, so their own limiter is the only
// thing slowing down service key guessing: use the real one here.
jest.unmock('../../../src/middleware/rateLimit')

const WRITE_LIMIT = 30

type Case = {
    name: string
    method: 'get' | 'post'
    path: string
    header: string
    envKey: string
    load: () => (app: Express) => void
}

const cases: Case[] = [
    {
        name: 'service announce',
        method: 'post',
        path: '/api/service/announce',
        header: 'x-announce-key',
        envKey: 'LUCKY_ANNOUNCE_API_KEY',
        load: () =>
            jest.requireActual<
                typeof import('../../../src/routes/serviceAnnounce')
            >('../../../src/routes/serviceAnnounce').setupServiceAnnounceRoutes,
    },
    {
        name: 'service guild members',
        method: 'get',
        path: '/api/service/guild/members',
        header: 'x-members-key',
        envKey: 'LUCKY_MEMBERS_API_KEY',
        load: () =>
            jest.requireActual<
                typeof import('../../../src/routes/serviceGuild')
            >('../../../src/routes/serviceGuild').setupServiceGuildRoutes,
    },
]

function buildApp(setup: (app: Express) => void): Express {
    const app = express()
    app.use(express.json())
    setup(app)
    app.use(
        (
            err: { statusCode?: number },
            _req: express.Request,
            res: express.Response,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _next: express.NextFunction,
        ) => {
            res.status(err.statusCode ?? 500).json({ error: 'failed' })
        },
    )
    return app
}

afterEach(() => {
    for (const c of cases) delete process.env[c.envKey]
})

describe('service key routes are rate limited', () => {
    it.each(cases)(
        '$name answers 429 after $path is guessed too often',
        async (c) => {
            process.env[c.envKey] = 'the-real-key'
            let setup: (app: Express) => void = () => undefined
            // A fresh module registry gives each route its own limiter store.
            jest.isolateModules(() => {
                setup = c.load()
            })
            const app = buildApp(setup)

            for (let i = 0; i < WRITE_LIMIT; i++) {
                await request(app)
                    [c.method](c.path)
                    .set(c.header, `guess-${i}`)
                    .expect(401)
            }

            await request(app)
                [c.method](c.path)
                .set(c.header, 'one-more-guess')
                .expect(429)
        },
    )
})
