import express from 'express'
import request from 'supertest'
import { setupInternalNotifyRoutes } from './internalNotify'

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_KEY = process.env.LUCKY_NOTIFY_API_KEY
const ORIGINAL_TOKEN = process.env.DISCORD_TOKEN

function buildApp(): express.Express {
    const app = express()
    app.use(express.json())
    setupInternalNotifyRoutes(app)
    app.use(
        (
            err: { statusCode?: number; message?: string },
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction,
        ) => {
            res.status(err.statusCode ?? 500).json({
                error: err.message ?? 'unknown',
            })
        },
    )
    return app
}

afterEach(() => {
    global.fetch = ORIGINAL_FETCH
    process.env.LUCKY_NOTIFY_API_KEY = ORIGINAL_KEY
    process.env.DISCORD_TOKEN = ORIGINAL_TOKEN
})

describe('POST /api/internal/notify', () => {
    it('rejects when LUCKY_NOTIFY_API_KEY env is missing', async () => {
        delete process.env.LUCKY_NOTIFY_API_KEY
        const res = await request(buildApp())
            .post('/api/internal/notify')
            .set('x-notify-key', 'anything')
            .send({ channelId: '1', content: 'hi' })
        expect(res.status).toBe(401)
    })

    it('rejects on wrong key', async () => {
        process.env.LUCKY_NOTIFY_API_KEY = 'right'
        const res = await request(buildApp())
            .post('/api/internal/notify')
            .set('x-notify-key', 'wrong')
            .send({ channelId: '1', content: 'hi' })
        expect(res.status).toBe(401)
    })

    it('rejects on missing channelId', async () => {
        process.env.LUCKY_NOTIFY_API_KEY = 'k'
        process.env.DISCORD_TOKEN = 't'
        const res = await request(buildApp())
            .post('/api/internal/notify')
            .set('x-notify-key', 'k')
            .send({ content: 'hi' })
        expect(res.status).toBe(400)
    })

    it('forwards to Discord and returns 204 on success', async () => {
        process.env.LUCKY_NOTIFY_API_KEY = 'k'
        process.env.DISCORD_TOKEN = 'tok'
        const fetchMock = jest
            .fn()
            .mockResolvedValue({ ok: true, status: 200, text: async () => '' })
        global.fetch = fetchMock as unknown as typeof fetch
        const res = await request(buildApp())
            .post('/api/internal/notify')
            .set('x-notify-key', 'k')
            .send({ channelId: '12345', content: 'hello' })
        expect(res.status).toBe(204)
        expect(fetchMock).toHaveBeenCalledWith(
            'https://discord.com/api/v10/channels/12345/messages',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bot tok',
                }),
            }),
        )
    })

    it('returns 502 when Discord rejects', async () => {
        process.env.LUCKY_NOTIFY_API_KEY = 'k'
        process.env.DISCORD_TOKEN = 'tok'
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => 'forbidden',
        }) as unknown as typeof fetch
        const res = await request(buildApp())
            .post('/api/internal/notify')
            .set('x-notify-key', 'k')
            .send({ channelId: '1', content: 'x' })
        expect(res.status).toBe(502)
    })
})
