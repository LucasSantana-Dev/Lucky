import type { Client } from 'discord.js'

const mockErrorLog = jest.fn()
const mockInfoLog = jest.fn()
const mockGetPrismaClient = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => mockErrorLog(...args),
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    debugLog: jest.fn(),
    getPrismaClient: () => mockGetPrismaClient(),
}))

import { aiDevToolkitService } from '../../src/services/AiDevToolkitService'

function makeSnapshot() {
    return {
        commitSha: 'abc1234',
        patterns: [],
        lastUpdated: new Date().toISOString(),
    }
}

function makeChannel(overrides: Record<string, unknown> = {}) {
    return {
        isTextBased: () => true,
        isThread: () => false,
        archived: false,
        setArchived: jest
            .fn<Promise<void>, [boolean]>()
            .mockResolvedValue(undefined),
        messages: {
            fetch: jest.fn().mockRejectedValue(new Error('not found')),
        },
        send: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        ...overrides,
    }
}

function makeClient(channel: ReturnType<typeof makeChannel> | null) {
    return {
        channels: { fetch: jest.fn().mockResolvedValue(channel) },
    } as unknown as Client
}

describe('AiDevToolkitService', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = aiDevToolkitService as any
    let fetchSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        svc.lastCommitSha = null
        fetchSpy = jest
            .spyOn(svc, 'fetchRepoSnapshot')
            .mockResolvedValue(makeSnapshot())
        mockGetPrismaClient.mockReturnValue({
            liveBoard: {
                findUnique: jest.fn().mockResolvedValue(null),
                upsert: jest.fn().mockResolvedValue({}),
            },
        })
    })

    afterEach(() => {
        fetchSpy.mockRestore()
    })

    describe('syncBoard — archived thread guard', () => {
        it('unarchives the thread before posting when it is archived', async () => {
            const mockSetArchived = jest
                .fn<Promise<void>, [boolean]>()
                .mockResolvedValue(undefined)
            const channel = makeChannel({
                isThread: () => true,
                archived: true,
                setArchived: mockSetArchived,
            })

            await aiDevToolkitService.syncBoard(makeClient(channel))

            expect(mockSetArchived).toHaveBeenCalledWith(false)
            expect(channel.send).toHaveBeenCalled()
        })

        it('skips the sync cycle and logs error when unarchive fails', async () => {
            const mockSetArchived = jest
                .fn<Promise<void>, [boolean]>()
                .mockRejectedValue(new Error('Missing Permissions'))
            const channel = makeChannel({
                isThread: () => true,
                archived: true,
                setArchived: mockSetArchived,
            })

            await aiDevToolkitService.syncBoard(makeClient(channel))

            expect(mockSetArchived).toHaveBeenCalledWith(false)
            expect(mockErrorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('cannot unarchive'),
                }),
            )
            expect(channel.send).not.toHaveBeenCalled()
        })

        it('does not call setArchived when the thread is not archived', async () => {
            const mockSetArchived = jest.fn()
            const channel = makeChannel({
                isThread: () => true,
                archived: false,
                setArchived: mockSetArchived,
            })

            await aiDevToolkitService.syncBoard(makeClient(channel))

            expect(mockSetArchived).not.toHaveBeenCalled()
            expect(channel.send).toHaveBeenCalled()
        })

        it('does not call setArchived for regular text channels', async () => {
            const mockSetArchived = jest.fn()
            const channel = makeChannel({
                isThread: () => false,
                setArchived: mockSetArchived,
            })

            await aiDevToolkitService.syncBoard(makeClient(channel))

            expect(mockSetArchived).not.toHaveBeenCalled()
        })
    })
})
