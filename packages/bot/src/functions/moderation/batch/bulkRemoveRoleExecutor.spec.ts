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

import { BulkRemoveRoleExecutor } from './bulkRemoveRoleExecutor'

function member(
    id: string,
    { bot = false, manageable = true, remove }: any = {},
) {
    return {
        id,
        user: { bot },
        manageable,
        roles: { remove: remove ?? jest.fn().mockResolvedValue(undefined) },
    }
}

function makeClient(members: any[]) {
    const role = { members: new Collection(members.map((m) => [m.id, m])) }
    const guild = {
        members: {
            me: { permissions: { has: () => true } },
            fetch: jest.fn().mockResolvedValue(undefined),
        },
        roles: { fetch: jest.fn().mockResolvedValue(role) },
    }
    return { guilds: { fetch: jest.fn().mockResolvedValue(guild) } } as never
}

const JOB = (over: any = {}) => ({
    id: 'job-1',
    guildId: 'g1',
    totalItems: over.totalItems ?? 2,
    options: { roleId: 'r1', reason: 'cleanup', ...(over.options ?? {}) },
})

describe('BulkRemoveRoleExecutor', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        batchJobServiceMock.getById.mockResolvedValue({
            nextCursor: null,
            status: 'in_progress',
        })
    })

    test('throws when options.roleId is missing', async () => {
        getClientMock.mockReturnValue(makeClient([]))
        await expect(
            new BulkRemoveRoleExecutor().execute(
                { id: 'j', guildId: 'g1', totalItems: 0, options: {} },
                jest.fn() as any,
            ),
        ).rejects.toThrow('bulk_remove_role requires options.roleId')
    })

    test('removes role from non-bot manageable members and skips bots', async () => {
        const removeHuman = jest.fn().mockResolvedValue(undefined)
        const removeBot = jest.fn()
        getClientMock.mockReturnValue(
            makeClient([
                member('100', { remove: removeHuman }),
                member('200', { bot: true, remove: removeBot }),
            ]),
        )

        const result = await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(removeHuman).toHaveBeenCalledWith('r1', 'cleanup')
        expect(removeBot).not.toHaveBeenCalled()
        expect(result).toMatchObject({ removed: 1, skipped: 0, failed: 0 })
    })

    test('skips members that are not manageable', async () => {
        const remove = jest.fn()
        getClientMock.mockReturnValue(
            makeClient([member('100', { manageable: false, remove })]),
        )

        const result = await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(remove).not.toHaveBeenCalled()
        expect(result).toMatchObject({ removed: 0, skipped: 1 })
    })

    test('treats unknown-member / forbidden as skip, other errors as failed', async () => {
        const gone = jest.fn().mockRejectedValue({ code: 10007 })
        const boom = jest.fn().mockRejectedValue(new Error('rate limited'))
        getClientMock.mockReturnValue(
            makeClient([
                member('100', { remove: gone }),
                member('200', { remove: boom }),
            ]),
        )

        const result = await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ removed: 0, skipped: 1, failed: 1 })
        expect(errorLogMock).toHaveBeenCalled()
    })

    test('stops gracefully when the job is cancelled mid-run', async () => {
        getClientMock.mockReturnValue(
            makeClient([member('100'), member('200')]),
        )
        batchJobServiceMock.getById
            .mockResolvedValueOnce({ nextCursor: null, status: 'in_progress' })
            .mockResolvedValue({ status: 'cancelled' })

        const result = await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ cancelled: true })
    })

    test('initializes tally from prior run processedItems, skippedItems, failedItems', async () => {
        const removeMember = jest.fn().mockResolvedValue(undefined)
        getClientMock.mockReturnValue(
            makeClient([member('100', { remove: removeMember })]),
        )
        batchJobServiceMock.getById.mockResolvedValue({
            nextCursor: null,
            status: 'in_progress',
            processedItems: 3,
            skippedItems: 2,
            failedItems: 1,
        })

        const onProgressMock = jest.fn().mockResolvedValue(undefined)
        const result = await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 7 }),
            onProgressMock,
        )

        expect(result).toMatchObject({ removed: 4, skipped: 2, failed: 1 })
        expect(onProgressMock).toHaveBeenCalled()
    })

    test('checkpoints progress BEFORE removing role (crash-safety)', async () => {
        const callOrder: string[] = []

        const removeMember = jest.fn(async () => {
            callOrder.push('remove')
        })

        getClientMock.mockReturnValue(
            makeClient([member('100', { remove: removeMember })]),
        )

        const onProgressMock = jest.fn(async () => {
            callOrder.push('progress')
        })

        await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 1 }),
            onProgressMock,
        )

        expect(onProgressMock).toHaveBeenCalled()
        expect(removeMember).toHaveBeenCalled()
        const progressIndex = callOrder.indexOf('progress')
        const removeIndex = callOrder.indexOf('remove')
        expect(progressIndex).toBeGreaterThanOrEqual(0)
        expect(removeIndex).toBeGreaterThanOrEqual(0)
        expect(progressIndex).toBeLessThan(removeIndex)
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

        const result = await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ paused: true })
    })

    test('resumes from cursor when prior run did not process all members', async () => {
        const removeFirst = jest.fn()
        const removeSecond = jest.fn().mockResolvedValue(undefined)
        getClientMock.mockReturnValue(
            makeClient([
                member('100', { remove: removeFirst }),
                member('200', { remove: removeSecond }),
            ]),
        )

        batchJobServiceMock.getById.mockResolvedValue({
            nextCursor: '100',
            status: 'in_progress',
        })

        const result = await new BulkRemoveRoleExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(removeFirst).not.toHaveBeenCalled()
        expect(removeSecond).toHaveBeenCalledWith('r1', 'cleanup')
        expect(result).toMatchObject({ removed: 1, skipped: 0, failed: 0 })
    })

    test('throws when ManageRoles permission is missing', async () => {
        getClientMock.mockReturnValue({
            guilds: {
                fetch: jest.fn().mockResolvedValue({
                    members: {
                        me: { permissions: { has: () => false } },
                        fetch: jest.fn().mockResolvedValue(undefined),
                    },
                    roles: {
                        fetch: jest
                            .fn()
                            .mockResolvedValue({ members: new Collection() }),
                    },
                }),
            },
        } as never)

        await expect(
            new BulkRemoveRoleExecutor().execute(JOB(), jest.fn() as any),
        ).rejects.toThrow('Bot missing Manage Roles permission')
    })

    test('throws when guild cannot be fetched', async () => {
        getClientMock.mockReturnValue({
            guilds: {
                fetch: jest
                    .fn()
                    .mockRejectedValue(new Error('Guild not found: g1')),
            },
        } as never)

        await expect(
            new BulkRemoveRoleExecutor().execute(JOB(), jest.fn() as any),
        ).rejects.toThrow('Guild not found')
    })

    test('throws when role cannot be fetched', async () => {
        getClientMock.mockReturnValue({
            guilds: {
                fetch: jest.fn().mockResolvedValue({
                    members: {
                        me: { permissions: { has: () => true } },
                        fetch: jest.fn().mockResolvedValue(undefined),
                    },
                    roles: {
                        fetch: jest
                            .fn()
                            .mockRejectedValue(new Error('Role not found: r1')),
                    },
                }),
            },
        } as never)

        await expect(
            new BulkRemoveRoleExecutor().execute(JOB(), jest.fn() as any),
        ).rejects.toThrow('Role not found')
    })
})
