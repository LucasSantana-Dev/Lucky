import { describe, it, expect, beforeEach, jest } from '@jest/globals'

type DeleteMany = jest.Mock<(args?: any) => Promise<{ count: number }>>

const mockGuildFindMany = jest.fn<(args?: any) => Promise<any>>()
const mockTransaction = jest.fn<(ops: Promise<unknown>[]) => Promise<any>>()
const deleteManyByModel = new Map<string, DeleteMany>()
const mockGetPrismaClient = jest.fn<() => any>()

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
}))

jest.mock('../../utils/general/log', () => ({
    errorLog: jest.fn(),
}))

import {
    DatabaseService,
    GUILD_PURGE_TARGETS,
    GUILD_PURGE_KEPT_TABLES,
} from './DatabaseService'

const DAY_MS = 24 * 60 * 60 * 1000

function buildPrismaMock(): Record<string, unknown> {
    const client: Record<string, unknown> = {
        guild: { findMany: mockGuildFindMany },
        $transaction: mockTransaction,
    }
    for (const { model } of GUILD_PURGE_TARGETS) {
        const fn: DeleteMany = jest.fn(async () => ({ count: 0 }))
        deleteManyByModel.set(model, fn)
        client[model] = { deleteMany: fn }
    }
    return client
}

describe('DatabaseService.purgeDepartedGuildData', () => {
    let service: DatabaseService

    beforeEach(() => {
        jest.clearAllMocks()
        deleteManyByModel.clear()
        mockGetPrismaClient.mockReturnValue(buildPrismaMock())
        mockTransaction.mockImplementation(async (ops) => Promise.all(ops))
        service = new DatabaseService()
    })

    it('selects only guilds whose leftAt is older than the grace period', async () => {
        mockGuildFindMany.mockResolvedValue([])
        const before = Date.now()

        await service.purgeDepartedGuildData(30)

        const args = mockGuildFindMany.mock.calls[0]?.[0] as {
            where: { leftAt: { lt: Date } }
            select: { discordId: true }
        }
        expect(args.select).toEqual({ discordId: true })
        const cutoff = args.where.leftAt.lt.getTime()
        expect(cutoff).toBeLessThanOrEqual(before - 30 * DAY_MS + 1000)
        expect(cutoff).toBeGreaterThanOrEqual(before - 30 * DAY_MS - 1000)
    })

    it('honors a custom grace period', async () => {
        mockGuildFindMany.mockResolvedValue([])
        const before = Date.now()

        await service.purgeDepartedGuildData(7)

        const args = mockGuildFindMany.mock.calls[0]?.[0] as {
            where: { leftAt: { lt: Date } }
        }
        const cutoff = args.where.leftAt.lt.getTime()
        expect(Math.abs(cutoff - (before - 7 * DAY_MS))).toBeLessThan(1000)
    })

    it('deletes nothing when no guild is past the grace period (rejoined guilds have leftAt null and never match)', async () => {
        mockGuildFindMany.mockResolvedValue([])

        const result = await service.purgeDepartedGuildData(30)

        expect(result.isSuccess()).toBe(true)
        expect(result.getData()).toEqual({ guilds: 0, deleted: {} })
        expect(mockTransaction).not.toHaveBeenCalled()
        for (const fn of deleteManyByModel.values()) {
            expect(fn).not.toHaveBeenCalled()
        }
    })

    it('purges every guild-scoped table for the departed guild ids and reports counts per table', async () => {
        mockGuildFindMany.mockResolvedValue([
            { discordId: 'g1' },
            { discordId: 'g2' },
        ])
        deleteManyByModel.get('serverLog')?.mockResolvedValue({ count: 5 })
        deleteManyByModel.get('memberXP')?.mockResolvedValue({ count: 2 })

        const result = await service.purgeDepartedGuildData(30)

        expect(result.isSuccess()).toBe(true)
        expect(mockTransaction).toHaveBeenCalledTimes(1)
        for (const fn of deleteManyByModel.values()) {
            expect(fn).toHaveBeenCalledWith({
                where: { guildId: { in: ['g1', 'g2'] } },
            })
        }
        expect(result.getData()).toEqual({
            guilds: 2,
            deleted: { server_logs: 5, member_xp: 2 },
        })
    })

    it('is idempotent: a second run over already-purged guilds deletes nothing', async () => {
        mockGuildFindMany.mockResolvedValue([{ discordId: 'g1' }])

        await service.purgeDepartedGuildData(30)
        const second = await service.purgeDepartedGuildData(30)

        expect(second.getData()).toEqual({ guilds: 1, deleted: {} })
    })

    it('never deletes the guilds row or analytics tables', () => {
        const purged = GUILD_PURGE_TARGETS.map((t) => t.table)
        for (const kept of [
            'guilds',
            'guild_membership_events',
            ...GUILD_PURGE_KEPT_TABLES.map((t) => t.table),
        ]) {
            expect(purged).not.toContain(kept)
        }
        expect(GUILD_PURGE_TARGETS.map((t) => t.model)).not.toContain('guild')
    })

    it('returns a failure when the delete transaction throws', async () => {
        mockGuildFindMany.mockResolvedValue([{ discordId: 'g1' }])
        mockTransaction.mockRejectedValue(new Error('db down'))

        const result = await service.purgeDepartedGuildData(30)

        expect(result.isFailure()).toBe(true)
    })
})
