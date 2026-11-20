/**
 * Postgres-backed tests for the raw SQL in packages/shared (#2534).
 *
 * The unit specs mock `$queryRaw` / `$executeRaw`, so the statements below
 * never reach a database there. These run them against a real, migrated
 * Postgres and assert the concurrency behavior they exist for.
 *
 * Run: DATABASE_URL=postgresql://... npm run test:db --workspace=packages/shared
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import {
    disconnectPrisma,
    getPrismaClient,
} from '../../utils/database/prismaClient.js'
import { AutoMessageService } from '../AutoMessageService.js'
import { EmbedBuilderService } from '../EmbedBuilderService.js'
import { DatabaseService } from './DatabaseService.js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const RUN_ID = `db-spec-${randomUUID()}`
const GUILD_ID = RUN_ID
const CONCURRENCY = 24

function assertDisposableDatabase(): void {
    const { hostname } = new URL(process.env.DATABASE_URL ?? '')
    if (!LOCAL_HOSTS.has(hostname)) {
        throw new Error(
            `Refusing to run database specs against non-local host "${hostname}"`,
        )
    }
}

describe('raw SQL against Postgres', () => {
    const prisma = getPrismaClient()

    beforeAll(async () => {
        assertDisposableDatabase()
        await prisma.guild.create({
            data: { discordId: GUILD_ID, name: RUN_ID, ownerId: RUN_ID },
        })
    })

    afterAll(async () => {
        await prisma.rateLimit.deleteMany({
            where: { key: { startsWith: RUN_ID } },
        })
        // Cascades to auto_messages and embed_templates.
        await prisma.guild.deleteMany({ where: { discordId: GUILD_ID } })
        await disconnectPrisma()
    })

    describe('DatabaseService.checkRateLimit', () => {
        const service = new DatabaseService({
            url: process.env.DATABASE_URL ?? '',
            ttl: 0,
            maxConnections: 10,
            connectionTimeout: 5000,
        })

        it('admits exactly `limit` of many concurrent calls', async () => {
            const key = `${RUN_ID}:concurrent`
            const limit = 7

            const results = await Promise.all(
                Array.from({ length: CONCURRENCY }, () =>
                    service.checkRateLimit(key, limit, 60_000),
                ),
            )

            expect(results.every((r) => r.isSuccess())).toBe(true)
            const admitted = results.filter((r) => r.getData() === true)
            expect(admitted).toHaveLength(limit)

            const row = await prisma.rateLimit.findUnique({ where: { key } })
            expect(row?.count).toBe(CONCURRENCY)
        })

        it('starts a new window once resetAt has passed', async () => {
            const key = `${RUN_ID}:expired`
            await service.checkRateLimit(key, 1, 60_000)
            const blocked = await service.checkRateLimit(key, 1, 60_000)
            expect(blocked.getData()).toBe(false)

            await prisma.rateLimit.update({
                where: { key },
                data: { resetAt: new Date(Date.now() - 1000) },
            })

            const admitted = await service.checkRateLimit(key, 1, 60_000)
            expect(admitted.getData()).toBe(true)
            const row = await prisma.rateLimit.findUnique({ where: { key } })
            expect(row?.count).toBe(1)
            expect(row?.resetAt.getTime()).toBeGreaterThan(Date.now())
        })

        it('counts each key on its own row', async () => {
            const a = await service.checkRateLimit(`${RUN_ID}:a`, 1, 60_000)
            const b = await service.checkRateLimit(`${RUN_ID}:b`, 1, 60_000)
            expect(a.getData()).toBe(true)
            expect(b.getData()).toBe(true)
        })
    })

    describe('AutoMessageService.upsertGuildTypeMessage advisory lock', () => {
        it('creates one row when many callers race on the same guild and type', async () => {
            const service = new AutoMessageService()

            const outcomes = await Promise.all(
                Array.from({ length: CONCURRENCY }, (_, i) =>
                    service.upsertGuildTypeMessage(GUILD_ID, 'welcome', {
                        message: `hello ${i}`,
                    }),
                ),
            )

            expect(outcomes.filter((o) => o === 'created')).toHaveLength(1)
            expect(outcomes.filter((o) => o === 'updated')).toHaveLength(
                CONCURRENCY - 1,
            )
            const rows = await prisma.autoMessage.count({
                where: { guildId: GUILD_ID, type: 'welcome' },
            })
            expect(rows).toBe(1)
        })

        it('does not serialize different types into one row', async () => {
            const service = new AutoMessageService()

            const outcomes = await Promise.all([
                service.upsertGuildTypeMessage(GUILD_ID, 'leave', {
                    message: 'bye',
                }),
                service.upsertGuildTypeMessage(GUILD_ID, 'scheduled', {
                    message: 'tick',
                }),
            ])

            expect(outcomes).toEqual(['created', 'created'])
        })
    })

    describe('EmbedBuilderService.upsertTemplate advisory lock', () => {
        it('creates one template when many callers race on the same name', async () => {
            const service = new EmbedBuilderService()

            const outcomes = await Promise.all(
                Array.from({ length: CONCURRENCY }, (_, i) =>
                    service.upsertTemplate(
                        GUILD_ID,
                        'Race',
                        { title: `title ${i}` },
                        RUN_ID,
                    ),
                ),
            )

            expect(outcomes.filter((o) => o === 'created')).toHaveLength(1)
            expect(outcomes.filter((o) => o === 'updated')).toHaveLength(
                CONCURRENCY - 1,
            )
            const rows = await prisma.embedTemplate.count({
                where: { guildId: GUILD_ID, name: 'race' },
            })
            expect(rows).toBe(1)
        })
    })
})
