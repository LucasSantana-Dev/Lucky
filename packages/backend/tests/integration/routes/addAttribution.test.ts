import { describe, test, expect, beforeEach, jest } from '@jest/globals'
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

    beforeEach(() => {
        table = fakeTable()
        ;(getPrismaClient as jest.Mock).mockReturnValue({
            guildJoinSource: { upsert: table.upsert },
        })
        app = express()
        setupSessionMiddleware(app)
        setupAddRoute(app)
        app.get('/api/auth/callback', handleOAuthCallback)
    })

    test('a test add with state=src.test lands in the table with its guild id', async () => {
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ code: 'x', state: 'src.test', guild_id: GUILD_ID })

        expect(res.status).toBe(302)
        expect(table.rows.get(GUILD_ID)).toMatchObject({
            guildDiscordId: GUILD_ID,
            source: 'test',
        })
        // Not a login: the code is never exchanged.
        expect(discordOAuthService.exchangeCodeForToken).not.toHaveBeenCalled()
    })

    test('an unknown source is stored as the fallback, never as typed', async () => {
        await request(app)
            .get('/api/auth/callback')
            .query({
                state: 'src.<script>alert(1)</script>',
                guild_id: GUILD_ID,
            })
            .expect(302)
        expect(table.rows.get(GUILD_ID)?.source).toBe('unknown')
    })

    test('an oversized state is capped to the fallback', async () => {
        await request(app)
            .get('/api/auth/callback')
            .query({ state: `src.${'a'.repeat(5000)}`, guild_id: GUILD_ID })
            .expect(302)
        expect(table.rows.get(GUILD_ID)?.source).toBe('unknown')
    })

    test('a guild_id that is not a snowflake writes nothing', async () => {
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ state: 'src.test', guild_id: "1' OR '1'='1" })
        expect(res.status).toBe(302)
        expect(table.upsert).not.toHaveBeenCalled()
    })

    test('the first source for a guild wins', async () => {
        await request(app)
            .get('/api/auth/callback')
            .query({ state: 'src.topgg', guild_id: GUILD_ID })
        await request(app)
            .get('/api/auth/callback')
            .query({ state: 'src.meta', guild_id: GUILD_ID })
        expect(table.rows.get(GUILD_ID)?.source).toBe('topgg')
    })

    test('the redirect never reflects state or source', async () => {
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ state: 'src.<b>evil</b>', guild_id: GUILD_ID })
        expect(res.headers.location).not.toContain('evil')
        expect(res.text).not.toContain('evil')
    })

    test('a database failure still redirects the user', async () => {
        table.upsert.mockRejectedValueOnce(new Error('db down'))
        const res = await request(app)
            .get('/api/auth/callback')
            .query({ state: 'src.test', guild_id: GUILD_ID })
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
            expect(url.searchParams.get('redirect_uri')).toMatch(
                /\/api\/auth\/callback$/,
            )
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
