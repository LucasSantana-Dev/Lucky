import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const upsertMock = jest.fn(async () => ({}))
const updateManyMock = jest.fn(async () => ({ count: 1 }))
const createMock = jest.fn(async () => ({}))
const findUniqueMock = jest.fn<
    () => Promise<{ joinedAt: Date | null } | null>
>(async () => null)
const transactionMock = jest.fn(async (ops: unknown) => {
    // Prisma's $transaction([...]) accepts an array of pending queries;
    // resolve them so call assertions on the inner mocks run.
    if (Array.isArray(ops)) {
        return Promise.all(ops)
    }
    return ops
})
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => ({
        guild: {
            upsert: (...args: unknown[]) => upsertMock(...args),
            updateMany: (...args: unknown[]) => updateManyMock(...args),
            findUnique: (...args: unknown[]) => findUniqueMock(...args),
        },
        guildMembershipEvent: {
            create: (...args: unknown[]) => createMock(...args),
        },
        $transaction: (...args: unknown[]) => transactionMock(...args),
    }),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

import {
    recordGuildJoin,
    recordGuildLeave,
    syncGuildsOnReady,
} from './guildMembershipService'

type FakeGuild = {
    id: string
    name: string
    icon: string | null
    ownerId: string
    joinedTimestamp: number | null
}

function fakeGuild(overrides: Partial<FakeGuild> = {}): FakeGuild {
    return {
        id: '111',
        name: 'Test Guild',
        icon: null,
        ownerId: 'owner-1',
        joinedTimestamp: 1747200000000,
        ...overrides,
    }
}

describe('guildMembershipService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('recordGuildJoin', () => {
        it('upserts guild and writes JOIN event in a transaction', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await recordGuildJoin(fakeGuild() as any)

            expect(transactionMock).toHaveBeenCalledTimes(1)
            expect(upsertMock).toHaveBeenCalledTimes(1)
            const call = upsertMock.mock.calls[0]?.[0] as Record<
                string,
                unknown
            >
            expect(call.where).toEqual({ discordId: '111' })
            const create = call.create as Record<string, unknown>
            expect(create.discordId).toBe('111')
            expect(create.joinedAt).toBeInstanceOf(Date)
            expect(create.leftAt).toBeNull()

            expect(createMock).toHaveBeenCalledTimes(1)
            const eventArgs = createMock.mock.calls[0]?.[0] as {
                data: Record<string, unknown>
            }
            expect(eventArgs.data.kind).toBe('JOIN')
            expect(eventArgs.data.guildDiscordId).toBe('111')
            expect(eventArgs.data.guildName).toBe('Test Guild')
        })

        it('falls back to now() when guild.joinedTimestamp is null', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await recordGuildJoin(fakeGuild({ joinedTimestamp: null }) as any)

            const call = upsertMock.mock.calls[0]?.[0] as Record<
                string,
                unknown
            >
            const update = call.update as Record<string, unknown>
            expect(update.joinedAt).toBeInstanceOf(Date)
        })

        it('logs an error and does not throw when the transaction fails', async () => {
            transactionMock.mockRejectedValueOnce(new Error('db down'))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await expect(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                recordGuildJoin(fakeGuild() as any),
            ).resolves.toBeUndefined()
            expect(errorLogMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('recordGuildLeave', () => {
        it('stamps leftAt on Guild and writes LEAVE event', async () => {
            await recordGuildLeave('222', 'Departing Guild')

            expect(transactionMock).toHaveBeenCalledTimes(1)
            expect(updateManyMock).toHaveBeenCalledTimes(1)
            const updateCall = updateManyMock.mock.calls[0]?.[0] as Record<
                string,
                unknown
            >
            expect(updateCall.where).toEqual({ discordId: '222' })
            const data = updateCall.data as Record<string, unknown>
            expect(data.leftAt).toBeInstanceOf(Date)

            const eventArgs = createMock.mock.calls[0]?.[0] as {
                data: Record<string, unknown>
            }
            expect(eventArgs.data.kind).toBe('LEAVE')
            expect(eventArgs.data.guildDiscordId).toBe('222')
        })
    })

    describe('syncGuildsOnReady', () => {
        it('skips guilds that already have joinedAt and upserts the rest', async () => {
            findUniqueMock.mockResolvedValueOnce({
                joinedAt: new Date('2026-01-01'),
            })
            findUniqueMock.mockResolvedValueOnce(null)

            const guildA = fakeGuild({ id: 'a' })
            const guildB = fakeGuild({ id: 'b', joinedTimestamp: null })
            const client = {
                guilds: {
                    cache: new Map([
                        ['a', guildA],
                        ['b', guildB],
                    ]),
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any

            await syncGuildsOnReady(client)

            expect(findUniqueMock).toHaveBeenCalledTimes(2)
            // Only guildB should be upserted (guildA already has joinedAt).
            expect(upsertMock).toHaveBeenCalledTimes(1)
            const call = upsertMock.mock.calls[0]?.[0] as Record<
                string,
                unknown
            >
            expect(call.where).toEqual({ discordId: 'b' })
            expect(infoLogMock).toHaveBeenCalledTimes(1)
        })
    })
})
