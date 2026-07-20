import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { Collection } from 'discord.js'

const getClientMock = jest.fn()
const errorLogMock = jest.fn()
const batchJobServiceMock = {
    getById: jest.fn() as jest.MockedFunction<any>,
}

jest.mock('../../../bot/clientStore', () => ({
    getStoredClient: () => getClientMock(),
    setClient: jest.fn(),
}))
jest.mock('@lucky/shared/services/batch', () => ({
    batchJobService: batchJobServiceMock,
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: any[]) => errorLogMock(...args),
}))

import { BulkAddRoleExecutor } from './bulkAddRoleExecutor'

function member(id: string, { bot = false, manageable = true, roles = [] }: any = {}) {
    const roleSet = new Set(roles)
    return {
        id,
        user: { bot },
        manageable,
        roles: {
            cache: { has: (r: string) => roleSet.has(r) },
            add: jest.fn().mockResolvedValue(undefined),
        },
    }
}

function makeClient(members: any[], targetRolePosition = 5) {
    const filterRole = { members: new Collection(members.map((m) => [m.id, m])) }
    const targetRole = { position: targetRolePosition }
    const guild = {
        members: {
            me: {
                permissions: { has: () => true },
                roles: { highest: { position: 10 } },
            },
            fetch: jest.fn().mockResolvedValue(undefined),
        },
        roles: {
            fetch: jest.fn().mockImplementation((id: string) => {
                if (id === 'filter-role') return Promise.resolve(filterRole)
                if (id === 'target-role') return Promise.resolve(targetRole)
                return Promise.resolve(null)
            }),
        },
    }
    return { guilds: { fetch: jest.fn().mockResolvedValue(guild) } } as never
}

const JOB = (over: any = {}) => ({
    id: 'job-1',
    guildId: 'g1',
    totalItems: over.totalItems ?? 2,
    options: {
        filterRoleId: 'filter-role',
        targetRoleId: 'target-role',
        ...(over.options ?? {}),
    },
})

describe('BulkAddRoleExecutor', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        batchJobServiceMock.getById.mockResolvedValue({
            nextCursor: null,
            status: 'in_progress',
        })
    })

    test('throws when options.filterRoleId is missing', async () => {
        getClientMock.mockReturnValue(makeClient([]))
        await expect(
            new BulkAddRoleExecutor().execute(
                { id: 'j', guildId: 'g1', totalItems: 0, options: { targetRoleId: 'target-role' } },
                jest.fn() as any,
            ),
        ).rejects.toThrow('bulk_add_role requires options.filterRoleId and options.targetRoleId')
    })

    test('throws when options.targetRoleId is missing', async () => {
        getClientMock.mockReturnValue(makeClient([]))
        await expect(
            new BulkAddRoleExecutor().execute(
                { id: 'j', guildId: 'g1', totalItems: 0, options: { filterRoleId: 'filter-role' } },
                jest.fn() as any,
            ),
        ).rejects.toThrow('bulk_add_role requires options.filterRoleId and options.targetRoleId')
    })

    test('adds role to non-bot manageable members and skips bots', async () => {
        const addRole = jest.fn().mockResolvedValue(undefined)
        const memberWithAdd = member('100', { roles: [] })
        memberWithAdd.roles.add = addRole
        getClientMock.mockReturnValue(
            makeClient([
                memberWithAdd,
                member('200', { bot: true, roles: [] }),
            ]),
        )

        const result = await new BulkAddRoleExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(addRole).toHaveBeenCalledWith('target-role')
        expect(result).toMatchObject({ added: 1, skipped: 0, failed: 0 })
    })

    test('skips members who already have the target role', async () => {
        getClientMock.mockReturnValue(
            makeClient([member('100', { roles: ['target-role'] })]),
        )

        const result = await new BulkAddRoleExecutor().execute(
            JOB({ totalItems: 0 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ added: 0, skipped: 0, failed: 0 })
    })

    test('skips members that are not manageable', async () => {
        const addRole = jest.fn()
        const memberUnmanageable = member('100', { manageable: false, roles: [] })
        memberUnmanageable.roles.add = addRole
        getClientMock.mockReturnValue(
            makeClient([memberUnmanageable]),
        )

        const result = await new BulkAddRoleExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(addRole).not.toHaveBeenCalled()
        expect(result).toMatchObject({ added: 0, skipped: 1 })
    })

    test('treats missing permissions / unknown member as skip, other errors as failed', async () => {
        const gone = jest.fn().mockRejectedValue({ code: 10007 })
        const boom = jest.fn().mockRejectedValue(new Error('rate limited'))
        const m1 = member('100', { roles: [] })
        m1.roles.add = gone
        const m2 = member('200', { roles: [] })
        m2.roles.add = boom
        getClientMock.mockReturnValue(makeClient([m1, m2]))

        const result = await new BulkAddRoleExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ added: 0, skipped: 1, failed: 1 })
        expect(errorLogMock).toHaveBeenCalled()
    })

    test('stops gracefully when the job is cancelled mid-run', async () => {
        getClientMock.mockReturnValue(
            makeClient([member('100'), member('200')]),
        )
        batchJobServiceMock.getById
            .mockResolvedValueOnce({ nextCursor: null, status: 'in_progress' })
            .mockResolvedValue({ status: 'cancelled' })

        const result = await new BulkAddRoleExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ cancelled: true })
    })

    test('pauses when Discord client becomes unavailable mid-run', async () => {
        let clientAvailable = true
        const clientMockImpl = jest.fn(() =>
            clientAvailable ? makeClient([member('100'), member('200')]) : null,
        )
        getClientMock.mockImplementation(clientMockImpl)

        batchJobServiceMock.getById
            .mockResolvedValueOnce({ nextCursor: null, status: 'in_progress' })
            .mockImplementation(async () => {
                if (clientMockImpl.mock.calls.length > 1) {
                    clientAvailable = false
                }
                return { status: 'in_progress' }
            })

        const result = await new BulkAddRoleExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ paused: true })
    })
})
