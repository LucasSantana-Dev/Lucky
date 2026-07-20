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

import { BulkBanExecutor } from './bulkBanExecutor'

function member(id: string, { bot = false, bannable = true, ban }: any = {}) {
    return {
        id,
        user: { bot },
        bannable,
        ban: ban ?? jest.fn().mockResolvedValue(undefined),
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

describe('BulkBanExecutor', () => {
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
            new BulkBanExecutor().execute(
                { id: 'j', guildId: 'g1', totalItems: 0, options: {} },
                jest.fn() as any,
            ),
        ).rejects.toThrow('bulk_ban requires options.roleId')
    })

    test('bans non-bot bannable members and skips bots', async () => {
        const banHuman = jest.fn().mockResolvedValue(undefined)
        const banBot = jest.fn()
        getClientMock.mockReturnValue(
            makeClient([
                member('100', { ban: banHuman }),
                member('200', { bot: true, ban: banBot }),
            ]),
        )

        const result = await new BulkBanExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(banHuman).toHaveBeenCalledWith({ reason: 'raid cleanup' })
        expect(banBot).not.toHaveBeenCalled()
        expect(result).toMatchObject({ banned: 1, skipped: 0, failed: 0 })
    })

    test('skips members that are not bannable', async () => {
        const ban = jest.fn()
        getClientMock.mockReturnValue(
            makeClient([member('100', { bannable: false, ban })]),
        )

        const result = await new BulkBanExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(ban).not.toHaveBeenCalled()
        expect(result).toMatchObject({ banned: 0, skipped: 1 })
    })

    test('treats unknown-member / forbidden / unknown-ban as skip, other errors as failed', async () => {
        const gone = jest.fn().mockRejectedValue({ code: 10007 })
        const alreadyBanned = jest.fn().mockRejectedValue({ code: 10026 })
        const boom = jest.fn().mockRejectedValue(new Error('rate limited'))
        getClientMock.mockReturnValue(
            makeClient([
                member('100', { ban: gone }),
                member('200', { ban: alreadyBanned }),
                member('300', { ban: boom }),
            ]),
        )

        const result = await new BulkBanExecutor().execute(
            JOB({ totalItems: 3 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ banned: 0, skipped: 2, failed: 1 })
        expect(errorLogMock).toHaveBeenCalled()
    })

    test('stops gracefully when the job is cancelled mid-run', async () => {
        getClientMock.mockReturnValue(
            makeClient([member('100'), member('200')]),
        )
        batchJobServiceMock.getById
            .mockResolvedValueOnce({ nextCursor: null, status: 'in_progress' })
            .mockResolvedValue({ status: 'cancelled' })

        const result = await new BulkBanExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ cancelled: true })
    })

    test('initializes tally from prior run processedItems, skippedItems, failedItems', async () => {
        const banMember = jest.fn().mockResolvedValue(undefined)
        getClientMock.mockReturnValue(
            makeClient([member('100', { ban: banMember })]),
        )
        batchJobServiceMock.getById.mockResolvedValue({
            nextCursor: null,
            status: 'in_progress',
            processedItems: 3,
            skippedItems: 2,
            failedItems: 1,
        })

        const onProgressMock = jest.fn().mockResolvedValue(undefined)
        const result = await new BulkBanExecutor().execute(
            JOB({ totalItems: 7 }),
            onProgressMock,
        )

        expect(result).toMatchObject({ banned: 4, skipped: 2, failed: 1 })
        expect(onProgressMock).toHaveBeenCalled()
    })

    test('checkpoints progress BEFORE banning member (crash-safety)', async () => {
        const callOrder: string[] = []

        const banMember = jest.fn(async () => {
            callOrder.push('ban')
        })

        getClientMock.mockReturnValue(
            makeClient([member('100', { ban: banMember })]),
        )

        const onProgressMock = jest.fn(async () => {
            callOrder.push('progress')
        })

        await new BulkBanExecutor().execute(
            JOB({ totalItems: 1 }),
            onProgressMock,
        )

        const progressIndex = callOrder.indexOf('progress')
        const banIndex = callOrder.indexOf('ban')
        expect(progressIndex).toBeGreaterThanOrEqual(0)
        expect(banIndex).toBeGreaterThanOrEqual(0)
        expect(progressIndex).toBeLessThan(banIndex)
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

        const result = await new BulkBanExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ paused: true })
    })
})
