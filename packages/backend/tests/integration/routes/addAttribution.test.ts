import {
    describe,
    test,
    expect,
    beforeEach,
    afterAll,
    jest,
} from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { getPrismaClient } from '@lucky/shared/utils'
import { setupAddRoute } from '../../../src/routes/add'
import { handleOAuthCallback } from '../../../src/routes/authCallback'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { discordOAuthService } from '../../../src/services/DiscordOAuthService'
import { BOT_INVITE_PERMISSIONS } from '@lucky/shared/constants'

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        exchangeCodeForToken: jest.fn(),
        getUserInfo: jest.fn(),
    },
}))

const GUILD_ID = '123456789012345678'
const CALLBACK_URI = 'https://lucky.test/api/auth/callback'

type Row = { guildDiscordId: string; source: string; createdAt: Date }

// In-memory stand-in for the guild_join_sources table (#2750).
function fakeTable() {
    const rows = new Map<string, Row>()
    const upsert = jest.fn(
        async (args: {
            where: { guildDiscordId: string }
            create: { guildDiscordId: string; source: string }
            update: object
        }) => {
            const existing = rows.get(args.where.guildDiscordId)
            if (existing) return existing
            const row = { ...args.create, createdAt: new Date() }
            rows.set(row.guildDiscordId, row)
            return row
        },
    )
    return { rows, upsert }
}

describe('landing source attribution (#2750)', () => {
    let app: express.Express
    let table: ReturnType<typeof fakeTable>

    const exchange = discordOAuthService.exchangeCodeForToken as jest.Mock

    const prevRedirect = process.env.WEBAPP_REDIRECT_URI
    afterAll(() => {
        if (prevRedirect === undefined) delete process.env.WEBAPP_REDIRECT_URI
        else process.env.WEBAPP_REDIRECT_URI = prevRedirect
    })

    beforeEach(() => {
        process.env.WEBAPP_REDIRECT_URI = CALLBACK_URI
        table = fakeTable()
        exchange.mockReset()
        // Default: Discord accepts the code and reports the guild the bot joined.
        exchange.mockImplementation(async () => ({
            access_token: 'a',
            token_type: 'Bearer',
            expires_in: 1,
            refresh_token: 'r',
            scope: 'bot',
            guild: { id: GUILD_ID },
        }))
        ;(getPrismaClient as jest.Mock).mockReturnValue({
            guildJoinSource: { upsert: table.upsert },
        })
        app = express()
        setupSessionMiddleware(app)
        setupAddRoute(app)
        app.get('/api/auth/callback', handleOAuthCallback)
    })

    test('an add with state=src.landing lands in the table with its guild id', async () => {
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.landing', guild_id: GUILD_ID })

        expect(res.status).toBe(302)
        expect(table.rows.get(GUILD_ID)).toMatchObject({
            guildDiscordId: GUILD_ID,
            source: 'landing',
        })
        expect(exchange).toHaveBeenCalledWith('x', CALLBACK_URI)
    })

    test('an unknown source is stored as the fallback, never as typed', async () => {
        await request(app)
            .get('/api/auth/callback')
            .query({
                code: 'x',
                state: 'src.<script>alert(1)</script>',
                guild_id: GUILD_ID,
            })
            .expect(302)
        expect(table.rows.get(GUILD_ID)?.source).toBe('unknown')
    })

    test('an oversized state is capped to the fallback', async () => {
        await request(app)
            .get('/api/auth/callback')
            .query({
                code: 'x',
                state: `src.${'a'.repeat(5000)}`,
                guild_id: GUILD_ID,
            })
            .expect(302)
        expect(table.rows.get(GUILD_ID)?.source).toBe('unknown')
    })

    test('a guild id that is not a snowflake writes nothing', async () => {
        exchange.mockResolvedValueOnce({
            access_token: 'a',
            token_type: 'Bearer',
            expires_in: 1,
            refresh_token: 'r',
            scope: 'bot',
            guild: { id: "1' OR '1'='1" },
        })
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.landing' })
        expect(res.status).toBe(302)
        expect(table.upsert).not.toHaveBeenCalled()
    })

    test('a forged request without a code writes nothing', async () => {
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ state: 'src.topgg', guild_id: GUILD_ID })
        expect(res.status).toBe(302)
        expect(res.headers.location).toContain('added=1')
        expect(exchange).not.toHaveBeenCalled()
        expect(table.upsert).not.toHaveBeenCalled()
    })

    test('a code Discord rejects writes nothing and still redirects', async () => {
        exchange.mockRejectedValueOnce(new Error('invalid_grant'))
        const { errorLog, warnLog } = jest.requireMock(
            '@lucky/shared/utils',
        ) as {
            errorLog: jest.Mock
            warnLog: jest.Mock
        }
        errorLog.mockClear()
        warnLog.mockClear()
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ code: 'forged', state: 'src.topgg', guild_id: GUILD_ID })
        expect(res.status).toBe(302)
        expect(res.headers.location).toContain('added=1')
        expect(table.upsert).not.toHaveBeenCalled()
        expect(warnLog).toHaveBeenCalled()
        expect(errorLog).not.toHaveBeenCalled()
    })

    test('the guild id comes from the token response, not the query', async () => {
        const real = '987654321098765432'
        exchange.mockResolvedValueOnce({
            access_token: 'a',
            token_type: 'Bearer',
            expires_in: 1,
            refresh_token: 'r',
            scope: 'bot',
            guild: { id: real },
        })
        await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.topgg', guild_id: GUILD_ID })
            .expect(302)
        expect(table.rows.get(real)?.source).toBe('topgg')
        expect(table.rows.has(GUILD_ID)).toBe(false)
    })

    test('a token response without a guild writes nothing', async () => {
        exchange.mockResolvedValueOnce({
            access_token: 'a',
            token_type: 'Bearer',
            expires_in: 1,
            refresh_token: 'r',
            scope: 'bot',
        })
        await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.topgg', guild_id: GUILD_ID })
            .expect(302)
        expect(table.upsert).not.toHaveBeenCalled()
    })

    test('the first source for a guild wins', async () => {
        await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.topgg', guild_id: GUILD_ID })
        await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.meta', guild_id: GUILD_ID })
        expect(table.rows.get(GUILD_ID)?.source).toBe('topgg')
    })

    test('the redirect never reflects state or source', async () => {
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.<b>evil</b>', guild_id: GUILD_ID })
        expect(res.headers.location).not.toContain('evil')
        expect(res.text).not.toContain('evil')
    })

    test('a database failure still redirects the user', async () => {
        table.upsert.mockRejectedValueOnce(new Error('db down'))
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.landing', guild_id: GUILD_ID })
        expect(res.status).toBe(302)
    })

    test('a login state without the prefix still goes through the login checks', async () => {
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'a'.repeat(64), guild_id: GUILD_ID })
        expect(res.headers.location).toContain('invalid_state')
        expect(table.upsert).not.toHaveBeenCalled()
    })

    describe('GET /api/add', () => {
        test('redirects to Discord with the source in state and the same permissions', async () => {
            const res = await request(app).get('/api/add?source=topgg')
            expect(res.status).toBe(302)
            const url = new URL(res.headers.location)
            expect(url.origin + url.pathname).toBe(
                'https://discord.com/oauth2/authorize',
            )
            expect(url.searchParams.get('state')).toBe('src.topgg')
            expect(url.searchParams.get('response_type')).toBe('code')
            expect(url.searchParams.get('permissions')).toBe(
                BOT_INVITE_PERMISSIONS,
            )
            expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK_URI)
        })

        test('falls back for an unknown or missing source', async () => {
            for (const q of ['?source=evil', '', '?source=a&source=b']) {
                const res = await request(app).get(`/api/add${q}`)
                expect(
                    new URL(res.headers.location).searchParams.get('state'),
                ).toBe('src.unknown')
            }
        })
    })
})
