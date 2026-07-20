import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { Collection } from 'discord.js'

const getClientMock = jest.fn()
const errorLogMock = jest.fn()
const batchJobServiceMock = {
    getById: jest.fn() as jest.MockedFunction<any>,
}
const moderationServiceMock = {
    createCase: jest.fn() as jest.MockedFunction<any>,
}

jest.mock('../../../bot/clientStore', () => ({
    getStoredClient: () => getClientMock(),
    setClient: jest.fn(),
}))
jest.mock('@lucky/shared/services/batch', () => ({
    batchJobService: batchJobServiceMock,
}))
jest.mock('@lucky/shared/services', () => ({
    moderationService: moderationServiceMock,
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: any[]) => errorLogMock(...args),
}))

import { BulkWarnExecutor } from './bulkWarnExecutor'

function member(id: string, { bot = false, tag = `user${id}#0001` }: any = {}) {
    return {
        id,
        user: { bot, tag },
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
    options: {
        roleId: 'r1',
        reason: 'spam',
        moderatorId: 'mod-1',
        moderatorName: 'Mod#1234',
        ...(over.options ?? {}),
    },
})

describe('BulkWarnExecutor', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        batchJobServiceMock.getById.mockResolvedValue({
            nextCursor: null,
            status: 'in_progress',
        })
        moderationServiceMock.createCase.mockResolvedValue({ id: 'case-1' })
    })

    test('throws when options.roleId is missing', async () => {
        getClientMock.mockReturnValue(makeClient([]))
        await expect(
            new BulkWarnExecutor().execute(
                { id: 'j', guildId: 'g1', totalItems: 0, options: {} },
                jest.fn() as any,
            ),
        ).rejects.toThrow('bulk_warn requires options.roleId')
    })

    test('skips when moderatorId is missing', async () => {
        getClientMock.mockReturnValue(
            makeClient([member('100')]),
        )
        const result = await new BulkWarnExecutor().execute(
            JOB({ options: { moderatorId: undefined } }),
            jest.fn() as any,
        )
        expect(result).toMatchObject({ warned: 0, skipped: 1, failed: 0 })
        expect(moderationServiceMock.createCase).not.toHaveBeenCalled()
    })

    test('creates warning cases for non-bot members and skips bots', async () => {
        getClientMock.mockReturnValue(
            makeClient([
                member('100'),
                member('200', { bot: true }),
            ]),
        )

        const result = await new BulkWarnExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith(
            expect.objectContaining({
                guildId: 'g1',
                type: 'warn',
                userId: '100',
                username: 'user100#0001',
                moderatorId: 'mod-1',
                moderatorName: 'Mod#1234',
                reason: 'spam',
            }),
        )
        expect(result).toMatchObject({ warned: 1, skipped: 0, failed: 0 })
    })

    test('treats moderation service errors as failed', async () => {
        moderationServiceMock.createCase.mockRejectedValue(new Error('db down'))
        getClientMock.mockReturnValue(makeClient([member('100')]))

        const result = await new BulkWarnExecutor().execute(
            JOB({ totalItems: 1 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ warned: 0, skipped: 0, failed: 1 })
        expect(errorLogMock).toHaveBeenCalled()
    })

    test('stops gracefully when the job is cancelled mid-run', async () => {
        getClientMock.mockReturnValue(
            makeClient([member('100'), member('200')]),
        )
        batchJobServiceMock.getById
            .mockResolvedValueOnce({ nextCursor: null, status: 'in_progress' })
            .mockResolvedValue({ status: 'cancelled' })

        const result = await new BulkWarnExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ cancelled: true })
    })

    test('initializes tally from prior run processedItems, skippedItems, failedItems', async () => {
        getClientMock.mockReturnValue(makeClient([member('100')]))
        batchJobServiceMock.getById.mockResolvedValue({
            nextCursor: null,
            status: 'in_progress',
            processedItems: 5,
            skippedItems: 2,
            failedItems: 1,
        })

        const result = await new BulkWarnExecutor().execute(
            JOB({ totalItems: 9 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ warned: 6, skipped: 2, failed: 1 })
    })

    test('checkpoints progress BEFORE creating warning case (crash-safety)', async () => {
        const callOrder: string[] = []

        moderationServiceMock.createCase.mockImplementation(async () => {
            callOrder.push('createCase')
            return { id: 'case-1' }
        })

        getClientMock.mockReturnValue(makeClient([member('100')]))

        const onProgressMock = jest.fn(async () => {
            callOrder.push('progress')
        })

        await new BulkWarnExecutor().execute(
            JOB({ totalItems: 1 }),
            onProgressMock,
        )

        const progressIndex = callOrder.indexOf('progress')
        const createIndex = callOrder.indexOf('createCase')
        expect(progressIndex).toBeGreaterThanOrEqual(0)
        expect(createIndex).toBeGreaterThanOrEqual(0)
        expect(progressIndex).toBeLessThan(createIndex)
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

        const result = await new BulkWarnExecutor().execute(
            JOB({ totalItems: 2 }),
            jest.fn() as any,
        )

        expect(result).toMatchObject({ paused: true })
    })
})
