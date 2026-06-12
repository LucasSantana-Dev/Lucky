import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import express from 'express'
import request from 'supertest'

// --- Service mock ------------------------------------------------------------
const createMock =
    jest.fn<(input: unknown) => Promise<{ id: string; deduped?: boolean }>>()
const getMock = jest.fn<(id: string) => Promise<unknown>>()
const listMock = jest.fn<(filter: unknown) => Promise<unknown[]>>()

jest.mock('@lucky/shared/services', () => ({
    SupportReportService: jest.fn().mockImplementation(() => ({
        create: (...a: unknown[]) => createMock(...(a as [unknown])),
        get: (...a: unknown[]) => getMock(...(a as [string])),
        list: (...a: unknown[]) => listMock(...(a as [unknown])),
    })),
}))

// --- Image validation mock (control 413/415 deterministically) ---------------
const validateImageMock = jest.fn<
    (i: { size?: number; mimetype?: string }) => {
        valid: boolean
        error?: string
    }
>()

jest.mock('@lucky/shared/utils/support', () => ({
    validateSupportImage: (...a: unknown[]) =>
        validateImageMock(...(a as [{ size?: number; mimetype?: string }])),
}))

jest.mock('@lucky/shared/config/config', () => ({
    getSupportUrl: () => undefined,
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

// Rate limiter and admin gate: pass-through; auth injects a test user.
jest.mock('../../../src/middleware/rateLimit', () => ({
    writeLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (
        req: { header: (n: string) => string | undefined; user?: unknown },
        res: { status: (n: number) => { json: (b: unknown) => void } },
        next: () => void,
    ) => {
        const testUser = req.header('x-test-user')
        if (!testUser) {
            return res.status(401).json({ error: 'not authenticated' })
        }
        req.user = { id: testUser }
        next()
    },
}))

jest.mock('../../../src/middleware/requireAdmin', () => ({
    requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { setupSupportRoutes } from '../../../src/routes/support'
import { errorHandler } from '../../../src/middleware/errorHandler'

function buildApp(): express.Express {
    const app = express()
    app.use(express.json())
    setupSupportRoutes(app)
    app.use(errorHandler)
    return app
}

const app = buildApp()
const ADMIN = ['x-test-user', 'admin-1'] as const

beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.SUPPORT_STAFF_CHANNEL_ID
    delete process.env.DISCORD_TOKEN
    createMock.mockResolvedValue({ id: 'rep_123' })
    validateImageMock.mockReturnValue({ valid: true })
})

afterEach(() => {
    jest.restoreAllMocks()
})

describe('POST /api/support', () => {
    it('creates a report from context only and returns 201 + id', async () => {
        const res = await request(app)
            .post('/api/support')
            .field('context', 'it broke when I clicked play')

        expect(res.status).toBe(201)
        expect(res.body).toEqual({ id: 'rep_123' })
        expect(createMock).toHaveBeenCalledWith(
            expect.objectContaining({
                context: 'it broke when I clicked play',
                surface: 'web',
                image: null,
            }),
        )
        // rate-limit key is a hash, never the raw ip
        const arg = createMock.mock.calls[0][0] as { rateLimitKey?: string }
        expect(arg.rateLimitKey).toMatch(/^[a-f0-9]{32}$/)
    })

    it('rejects a missing/empty context with 400', async () => {
        const res = await request(app).post('/api/support').field('context', '')
        expect(res.status).toBe(400)
        expect(createMock).not.toHaveBeenCalled()
    })

    it('persists optional cid/guildId/category', async () => {
        await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .field('cid', 'AB12cd34')
            .field('guildId', '123456789012345678')
            .field('category', 'playback-error')

        expect(createMock).toHaveBeenCalledWith(
            expect.objectContaining({
                correlationId: 'AB12cd34',
                guildId: '123456789012345678',
                errorCategory: 'playback-error',
            }),
        )
    })

    it('rejects a non-snowflake guildId with 400', async () => {
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .field('guildId', 'not-a-snowflake')
        expect(res.status).toBe(400)
        expect(createMock).not.toHaveBeenCalled()
    })

    it('accepts a valid image and forwards its bytes + mime', async () => {
        validateImageMock.mockReturnValue({ valid: true })
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .attach('image', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
                filename: 'shot.png',
                contentType: 'image/png',
            })

        expect(res.status).toBe(201)
        const arg = createMock.mock.calls[0][0] as {
            image?: unknown
            imageMimeType?: string
        }
        expect(Buffer.isBuffer(arg.image)).toBe(true)
        expect(arg.imageMimeType).toBe('image/png')
    })

    it('maps an oversized image to 413', async () => {
        validateImageMock.mockReturnValue({
            valid: false,
            error: 'Image exceeds 5 MB limit',
        })
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .attach('image', Buffer.from([1, 2, 3]), {
                filename: 'big.png',
                contentType: 'image/png',
            })
        expect(res.status).toBe(413)
        expect(createMock).not.toHaveBeenCalled()
    })

    it('maps an unsupported image type to 415', async () => {
        validateImageMock.mockReturnValue({
            valid: false,
            error: 'Unsupported image type: image/gif',
        })
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .attach('image', Buffer.from([1, 2, 3]), {
                filename: 'a.gif',
                contentType: 'image/gif',
            })
        expect(res.status).toBe(415)
    })

    it('maps multer LIMIT_FILE_SIZE (>5MB) to 413', async () => {
        const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 1)
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .attach('image', big, {
                filename: 'huge.png',
                contentType: 'image/png',
            })
        expect(res.status).toBe(413)
        expect(createMock).not.toHaveBeenCalled()
    })

    it('still returns 201 when staff notification is unconfigured', async () => {
        // env unset in beforeEach → notifyStaffChannel no-ops, request succeeds
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
        expect(res.status).toBe(201)
    })
})

describe('POST /api/support — staff notification', () => {
    const fetchMock = jest.fn<typeof fetch>()
    const realFetch = global.fetch

    beforeEach(() => {
        process.env.SUPPORT_STAFF_CHANNEL_ID = '999888777666555444'
        process.env.DISCORD_TOKEN = 'bot-token'
        global.fetch = fetchMock as unknown as typeof fetch
        fetchMock.mockResolvedValue({
            ok: true,
            text: async () => '',
        } as Response)
    })

    afterEach(() => {
        global.fetch = realFetch
    })

    it('pings the staff channel and suppresses mentions in the body', async () => {
        const res = await request(app)
            .post('/api/support')
            .field('context', 'hello @everyone please help')

        expect(res.status).toBe(201)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toContain('/channels/999888777666555444/messages')
        const body = JSON.parse(init.body as string)
        expect(body.allowed_mentions).toEqual({ parse: [] })
    })

    it('still returns 201 when the staff ping responds non-ok', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => 'forbidden',
        } as Response)
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
        expect(res.status).toBe(201)
    })

    it('still returns 201 when the staff ping throws', async () => {
        fetchMock.mockRejectedValue(new Error('network down'))
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
        expect(res.status).toBe(201)
    })

    it('forwards sid as the submissionKey (#1319)', async () => {
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .field('sid', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

        expect(res.status).toBe(201)
        expect(createMock).toHaveBeenCalledWith(
            expect.objectContaining({
                submissionKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            }),
        )
    })

    it('returns 200 without a second staff ping on a replayed sid (#1319)', async () => {
        createMock.mockResolvedValue({ id: 'rep_123', deduped: true })

        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .field('sid', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ id: 'rep_123' })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects a malformed sid with 400', async () => {
        const res = await request(app)
            .post('/api/support')
            .field('context', 'ctx')
            .field('sid', 'no spaces!')

        expect(res.status).toBe(400)
        expect(createMock).not.toHaveBeenCalled()
    })
})

describe('GET /api/admin/support', () => {
    it('requires auth', async () => {
        const res = await request(app).get('/api/admin/support')
        expect(res.status).toBe(401)
    })

    it('lists reports with filters', async () => {
        listMock.mockResolvedValue([{ id: 'rep_1', surface: 'web' }])
        const res = await request(app)
            .get('/api/admin/support?status=new&take=10')
            .set(...ADMIN)

        expect(res.status).toBe(200)
        expect(res.body).toEqual([{ id: 'rep_1', surface: 'web' }])
        expect(listMock).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'new', take: 10 }),
        )
    })
})

describe('GET /api/admin/support/:id', () => {
    it('returns metadata + hasImage and omits raw bytes', async () => {
        getMock.mockResolvedValue({
            id: 'rep_1',
            context: 'ctx',
            image: Buffer.from([1, 2, 3]),
            imageMimeType: 'image/png',
        })
        const res = await request(app)
            .get('/api/admin/support/rep_1')
            .set(...ADMIN)

        expect(res.status).toBe(200)
        expect(res.body.hasImage).toBe(true)
        expect(res.body.image).toBeUndefined()
    })

    it('returns 404 when the report is missing', async () => {
        getMock.mockResolvedValue(null)
        const res = await request(app)
            .get('/api/admin/support/nope')
            .set(...ADMIN)
        expect(res.status).toBe(404)
    })
})

describe('GET /api/admin/support/:id/image', () => {
    it('streams the image bytes with content-type + nosniff', async () => {
        getMock.mockResolvedValue({
            id: 'rep_1',
            image: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
            imageMimeType: 'image/png',
        })
        const res = await request(app)
            .get('/api/admin/support/rep_1/image')
            .set(...ADMIN)

        expect(res.status).toBe(200)
        expect(res.headers['content-type']).toContain('image/png')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('returns 404 when there is no image', async () => {
        getMock.mockResolvedValue({ id: 'rep_1', image: null })
        const res = await request(app)
            .get('/api/admin/support/rep_1/image')
            .set(...ADMIN)
        expect(res.status).toBe(404)
    })
})
