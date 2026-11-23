import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import { EventEmitter } from 'events'
import type { Express } from 'express'
import { setupStateRoutes } from '../../../src/routes/music/stateRoutes'
import { sseClients, sseStreamCounts } from '../../../src/routes/music/helpers'

const mockGetState = jest.fn<(guildId: string) => Promise<unknown>>()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        getState: (guildId: string) => mockGetState(guildId),
    },
}))

type Handler = (req: unknown, res: unknown) => unknown

const GUILD_ID = '111111111111111111'

function captureStreamHandler(): Handler {
    const routes = new Map<string, Handler[]>()
    const fakeApp = {
        get: (path: string, ...handlers: Handler[]) => {
            routes.set(path, handlers)
        },
    } as unknown as Express
    setupStateRoutes(fakeApp)
    const handlers = routes.get('/api/guilds/:guildId/music/stream')
    if (!handlers) throw new Error('stream route not registered')
    return handlers[handlers.length - 1]
}

function makeReq(userId = 'user-1', sessionId = 'sess-1') {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>
    req.params = { guildId: GUILD_ID }
    req.userId = userId
    req.sessionId = sessionId
    return req
}

function makeRes() {
    const res = {
        writableEnded: false,
        destroyed: false,
        headersSent: false,
        statusCode: 200,
        body: undefined as unknown,
        writeHead: jest.fn(() => {
            res.headersSent = true
            return res
        }),
        write: jest.fn(() => true),
        end: jest.fn(() => {
            res.writableEnded = true
        }),
        status: jest.fn((code: number) => {
            res.statusCode = code
            return res
        }),
        json: jest.fn((body: unknown) => {
            res.body = body
            res.writableEnded = true
            return res
        }),
    }
    return res
}

describe('music stream route lifecycle', () => {
    let handler: Handler

    beforeEach(() => {
        jest.useFakeTimers()
        mockGetState.mockReset()
        sseClients.clear()
        sseStreamCounts.clear()
        handler = captureStreamHandler()
    })

    afterEach(() => {
        jest.clearAllTimers()
        jest.useRealTimers()
        sseClients.clear()
    })

    test('a disconnect during the state lookup leaves no live interval', async () => {
        let resolveState!: (value: unknown) => void
        mockGetState.mockReturnValue(
            new Promise((resolve) => {
                resolveState = resolve
            }),
        )

        const req = makeReq()
        const res = makeRes()
        const pending = handler(req, res)

        req.emit('close')
        resolveState({ guildId: GUILD_ID })
        await pending

        expect(jest.getTimerCount()).toBe(0)
        expect(sseClients.get(GUILD_ID)?.size ?? 0).toBe(0)
        expect(sseStreamCounts.has(`user-1:${GUILD_ID}`)).toBe(false)
        jest.advanceTimersByTime(120_000)
        expect(res.write).not.toHaveBeenCalled()
    })

    test('a failed state lookup ends the stream and frees the slot', async () => {
        mockGetState.mockRejectedValue(new Error('redis down'))
        const res = makeRes()
        await handler(makeReq(), res)

        expect(res.end).toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
        expect(sseStreamCounts.has(`user-1:${GUILD_ID}`)).toBe(false)
        expect(sseClients.get(GUILD_ID)?.size ?? 0).toBe(0)
    })

    test('a client that left during auth gets no slot or heartbeat', async () => {
        mockGetState.mockResolvedValue(null)
        const req = makeReq()
        req.destroyed = true
        const res = makeRes()
        await handler(req, res)

        expect(res.writeHead).not.toHaveBeenCalled()
        expect(mockGetState).not.toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
        expect(sseStreamCounts.size).toBe(0)
    })

    test('clears the heartbeat when a write throws', async () => {
        mockGetState.mockResolvedValue(null)
        const req = makeReq()
        const res = makeRes()
        await handler(req, res)
        expect(jest.getTimerCount()).toBe(1)

        res.write.mockImplementation(() => {
            throw new Error('EPIPE')
        })
        jest.advanceTimersByTime(30_000)

        expect(jest.getTimerCount()).toBe(0)
        expect(sseClients.get(GUILD_ID)?.size ?? 0).toBe(0)
    })

    test('rejects streams over the per user and guild cap with 429', async () => {
        mockGetState.mockResolvedValue(null)
        const open: Array<ReturnType<typeof makeReq>> = []
        for (let i = 0; i < 3; i++) {
            const req = makeReq('user-1', `sess-${i}`)
            const res = makeRes()
            await handler(req, res)
            expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything())
            open.push(req)
        }

        const extraRes = makeRes()
        await handler(makeReq('user-1', 'sess-x'), extraRes)
        expect(extraRes.status).toHaveBeenCalledWith(429)
        expect(extraRes.writeHead).not.toHaveBeenCalled()
        expect(mockGetState).toHaveBeenCalledTimes(3)

        // A different user is unaffected.
        const otherRes = makeRes()
        await handler(makeReq('user-2', 'sess-2'), otherRes)
        expect(otherRes.writeHead).toHaveBeenCalledWith(200, expect.anything())

        // Closing one stream frees a slot (normal tab refresh).
        open[0].emit('close')
        const retryRes = makeRes()
        await handler(makeReq('user-1', 'sess-y'), retryRes)
        expect(retryRes.writeHead).toHaveBeenCalledWith(200, expect.anything())
    })

    test('a double close only frees one slot', async () => {
        mockGetState.mockResolvedValue(null)
        const reqs = []
        for (let i = 0; i < 3; i++) {
            const req = makeReq()
            await handler(req, makeRes())
            reqs.push(req)
        }
        reqs[0].emit('close')
        reqs[0].emit('close')

        await handler(makeReq(), makeRes())
        const extraRes = makeRes()
        await handler(makeReq(), extraRes)
        expect(extraRes.status).toHaveBeenCalledWith(429)
    })
})
