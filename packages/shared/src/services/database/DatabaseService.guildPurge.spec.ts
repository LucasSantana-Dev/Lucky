import { describe, it, expect, beforeEach, jest } from '@jest/globals'

type DeleteMany = jest.Mock<(args?: any) => Promise<{ count: number }>>

const mockQueryRaw = jest.fn<(...args: any[]) => Promise<any>>()
const mockTransaction =
    jest.fn<(fn: (tx: any) => Promise<any>, opts?: any) => Promise<any>>()
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
        $queryRaw: mockQueryRaw,
        $transaction: mockTransaction,
    }
    for (const { model } of GUILD_PURGE_TARGETS) {
        const fn: DeleteMany = jest.fn(async () => ({ count: 0 }))
        deleteManyByModel.set(model, fn)
        client[model] = { deleteMany: fn }
    }
    return client
}

function cutoffFromQuery(): number {
    const call = mockQueryRaw.mock.calls[0] as unknown as [string[], Date]
    expect(call[0].join('?')).toMatch(
        /SELECT "discordId" FROM "guilds" WHERE "leftAt" < \? FOR UPDATE/,
    )
    return call[1].getTime()
}

describe('DatabaseService.purgeDepartedGuildData', () => {
    let service: DatabaseService

    beforeEach(() => {
        jest.clearAllMocks()
        deleteManyByModel.clear()
        const client = buildPrismaMock()
        mockGetPrismaClient.mockReturnValue(client)
        mockTransaction.mockImplementation(async (fn) => fn(client))
        service = new DatabaseService()
    })

    it('selects only guilds whose leftAt is older than the grace period', async () => {
        mockQueryRaw.mockResolvedValue([])
        const before = Date.now()

        await service.purgeDepartedGuildData(30)

        const cutoff = cutoffFromQuery()
        expect(cutoff).toBeLessThanOrEqual(before - 30 * DAY_MS + 1000)
        expect(cutoff).toBeGreaterThanOrEqual(before - 30 * DAY_MS - 1000)
    })

    it('honors a custom grace period', async () => {
        mockQueryRaw.mockResolvedValue([])
        const before = Date.now()

        await service.purgeDepartedGuildData(7)

        const cutoff = cutoffFromQuery()
        expect(Math.abs(cutoff - (before - 7 * DAY_MS))).toBeLessThan(1000)
    })

    it('deletes nothing when no guild is past the grace period (rejoined guilds have leftAt null and never match)', async () => {
        mockQueryRaw.mockResolvedValue([])

        const result = await service.purgeDepartedGuildData(30)

        expect(result.isSuccess()).toBe(true)
        expect(result.getData()).toEqual({ guilds: 0, deleted: {} })
        for (const fn of deleteManyByModel.values()) {
            expect(fn).not.toHaveBeenCalled()
        }
    })

    it('purges every guild-scoped table for the departed guild ids and reports counts per table', async () => {
        mockQueryRaw.mockResolvedValue([
            { discordId: 'g1' },
            { discordId: 'g2' },
        ])
        deleteManyByModel.get('serverLog')?.mockResolvedValue({ count: 5 })
        deleteManyByModel.get('memberXP')?.mockResolvedValue({ count: 2 })

        const result = await service.purgeDepartedGuildData(30)

        expect(result.isSuccess()).toBe(true)
        expect(mockTransaction).toHaveBeenCalledTimes(1)
        expect(mockTransaction.mock.calls[0]?.[1]).toEqual({ timeout: 60_000 })
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

    it('never purges a guild the bot is currently in, even if leftAt is still set (rejoin not yet recorded)', async () => {
        mockQueryRaw.mockResolvedValue([
            { discordId: 'g1' },
            { discordId: 'rejoined' },
        ])

        const result = await service.purgeDepartedGuildData(30, ['rejoined'])

        expect(result.getData()).toEqual({ guilds: 1, deleted: {} })
        for (const fn of deleteManyByModel.values()) {
            expect(fn).toHaveBeenCalledWith({
                where: { guildId: { in: ['g1'] } },
            })
        }
    })

    it('deletes nothing when every departed guild is back in the live cache', async () => {
        mockQueryRaw.mockResolvedValue([{ discordId: 'g1' }])

        const result = await service.purgeDepartedGuildData(30, ['g1'])

        expect(result.getData()).toEqual({ guilds: 0, deleted: {} })
        for (const fn of deleteManyByModel.values()) {
            expect(fn).not.toHaveBeenCalled()
        }
    })

    it('is idempotent: a second run over already-purged guilds deletes nothing', async () => {
        mockQueryRaw.mockResolvedValue([{ discordId: 'g1' }])
        // Rows exist only until the first delete, like a real table.
        deleteManyByModel
            .get('serverLog')
            ?.mockResolvedValueOnce({ count: 4 })
            .mockResolvedValue({ count: 0 })

        const first = await service.purgeDepartedGuildData(30)
        const second = await service.purgeDepartedGuildData(30)

        expect(first.getData()).toEqual({
            guilds: 1,
            deleted: { server_logs: 4 },
        })
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
        mockTransaction.mockRejectedValue(new Error('db down'))

        const result = await service.purgeDepartedGuildData(30)

        expect(result.isFailure()).toBe(true)
    })
})
