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

import { BulkKickExecutor } from './bulkKickExecutor'

function member(id: string, { bot = false, kickable = true, kick }: any = {}) {
    return {
        id,
        user: { bot },
        kickable,
        kick: kick ?? jest.fn().mockResolvedValue(undefined),
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
    options: { roleId: 'r1', reason: 'raid cleanup', ...(over.options ?? {}) },
})

describe('BulkKickExecutor', () => {
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
            new BulkKickExecutor().execute(
                { id: 'j', guildId: 'g1', totalItems: 0, options: {} },
                jest.fn() as any,
            ),
        ).rejects.toThrow('bulk_kick requires options.roleId')
    })

    test('kicks non-bot kickable members and skips bots', async () => {
        const kickHuman = jest.fn().mockResolvedValue(undefined)
        const kickBot = jest.fn()
        getClientMock.mockReturnValue(
            makeClient([
                member('100', { kick: kickHuman }),
                member('200', { bot: true, kick: kickBot }),
            ]),
        )

        const result = await new BulkKickExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(kickHuman).toHaveBeenCalledWith('raid cleanup')
        expect(kickBot).not.toHaveBeenCalled()
        expect(result).toMatchObject({ kicked: 1, skipped: 0, failed: 0 })
    })

    test('skips members that are not kickable', async () => {
        const kick = jest.fn()
        getClientMock.mockReturnValue(
            makeClient([member('100', { kickable: false, kick })]),
        )

        const result = await new BulkKickExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(kick).not.toHaveBeenCalled()
        expect(result).toMatchObject({ kicked: 0, skipped: 1 })
    })

    test('treats unknown-member / forbidden as skip, other errors as failed', async () => {
        const gone = jest.fn().mockRejectedValue({ code: 10007 })
        const boom = jest.fn().mockRejectedValue(new Error('rate limited'))
        getClientMock.mockReturnValue(
            makeClient([
                member('100', { kick: gone }),
                member('200', { kick: boom }),
            ]),
        )

        const result = await new BulkKickExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ kicked: 0, skipped: 1, failed: 1 })
        expect(errorLogMock).toHaveBeenCalled()
    })

    test('stops gracefully when the job is cancelled mid-run', async () => {
        getClientMock.mockReturnValue(
            makeClient([member('100'), member('200')]),
        )
        // First getById (initial cursor read) ok; next call reports cancelled.
        batchJobServiceMock.getById
            .mockResolvedValueOnce({ nextCursor: null, status: 'in_progress' })
            .mockResolvedValue({ status: 'cancelled' })

        const result = await new BulkKickExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ cancelled: true })
    })
})
