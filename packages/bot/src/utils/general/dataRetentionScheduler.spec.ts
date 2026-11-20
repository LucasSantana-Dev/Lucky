const mockCleanupOldData = jest.fn<Promise<unknown>, []>()
const mockPurgeDepartedGuildData = jest.fn<Promise<unknown>, [number]>()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    DatabaseService: jest.fn().mockImplementation(() => ({
        cleanupOldData: mockCleanupOldData,
        purgeDepartedGuildData: mockPurgeDepartedGuildData,
    })),
}))

import { DataRetentionScheduler } from './dataRetentionScheduler'
import { infoLog, errorLog } from '@lucky/shared/utils'

function makeResult(overrides: {
    isFailure: boolean
    data?: unknown
    error?: Error
}) {
    return {
        isSuccess: () => !overrides.isFailure,
        isFailure: () => overrides.isFailure,
        getData: () => overrides.data,
        getError: () => overrides.error,
    }
}

let scheduler: DataRetentionScheduler | undefined

const ENV_KEYS = [
    'GUILD_DATA_PURGE_ENABLED',
    'GUILD_DATA_PURGE_GRACE_DAYS',
] as const

beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    for (const key of ENV_KEYS) delete process.env[key]
})

afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
    // Always clear the interval, even when an assertion above failed.
    scheduler?.stop()
    scheduler = undefined
    jest.useRealTimers()
})

describe('DataRetentionScheduler', () => {
    test('sweeps immediately on start and logs the deleted count', async () => {
        mockCleanupOldData.mockResolvedValue(
            makeResult({
                isFailure: false,
                data: 42,
            }),
        )
        scheduler = new DataRetentionScheduler(100)

        scheduler.start({} as any)
        // onStart's immediate tick is fire-and-forget; flush its promise.
        await jest.advanceTimersByTimeAsync(0)

        expect(mockCleanupOldData).toHaveBeenCalledTimes(1)
        expect(infoLog).toHaveBeenCalledWith({
            message: 'Data retention sweep deleted 42 row(s)',
        })
        expect(errorLog).not.toHaveBeenCalled()
    })

    test('logs an error and does not throw when the sweep fails', async () => {
        const boom = new Error('boom')
        mockCleanupOldData.mockResolvedValue(
            makeResult({
                isFailure: true,
                error: boom,
            }),
        )
        scheduler = new DataRetentionScheduler(100)

        scheduler.start({} as any)
        await jest.advanceTimersByTimeAsync(0)

        expect(errorLog).toHaveBeenCalledWith({
            message: 'Data retention sweep failed',
            error: boom,
        })
        expect(infoLog).not.toHaveBeenCalled()
    })

    test('ticks again on the configured interval', async () => {
        mockCleanupOldData.mockResolvedValue(
            makeResult({
                isFailure: false,
                data: 0,
            }),
        )
        scheduler = new DataRetentionScheduler(20)

        scheduler.start({} as any)
        await jest.advanceTimersByTimeAsync(0)
        expect(mockCleanupOldData).toHaveBeenCalledTimes(1)

        await jest.advanceTimersByTimeAsync(20)
        expect(mockCleanupOldData).toHaveBeenCalledTimes(2)
    })

    describe('departed-guild purge (#2377)', () => {
        async function runOnce(): Promise<void> {
            mockCleanupOldData.mockResolvedValue(
                makeResult({ isFailure: false, data: 0 }),
            )
            scheduler = new DataRetentionScheduler(100)
            scheduler.start({} as any)
            await jest.advanceTimersByTimeAsync(0)
        }

        test('does not purge when the flag is unset (default off)', async () => {
            await runOnce()

            expect(mockPurgeDepartedGuildData).not.toHaveBeenCalled()
        })

        test('does not purge when the flag is anything other than "true"', async () => {
            process.env.GUILD_DATA_PURGE_ENABLED = 'yes'

            await runOnce()

            expect(mockPurgeDepartedGuildData).not.toHaveBeenCalled()
        })

        test('purges with the 30-day default grace period when enabled', async () => {
            process.env.GUILD_DATA_PURGE_ENABLED = 'true'
            mockPurgeDepartedGuildData.mockResolvedValue(
                makeResult({
                    isFailure: false,
                    data: {
                        guilds: 2,
                        deleted: { server_logs: 5, member_xp: 2 },
                    },
                }),
            )

            await runOnce()

            expect(mockPurgeDepartedGuildData).toHaveBeenCalledWith(30)
            expect(infoLog).toHaveBeenCalledWith({
                message:
                    'Departed-guild purge removed data for 2 guild(s): server_logs=5, member_xp=2',
            })
        })

        test('uses GUILD_DATA_PURGE_GRACE_DAYS when it is a positive integer', async () => {
            process.env.GUILD_DATA_PURGE_ENABLED = 'true'
            process.env.GUILD_DATA_PURGE_GRACE_DAYS = '7'
            mockPurgeDepartedGuildData.mockResolvedValue(
                makeResult({
                    isFailure: false,
                    data: { guilds: 0, deleted: {} },
                }),
            )

            await runOnce()

            expect(mockPurgeDepartedGuildData).toHaveBeenCalledWith(7)
            expect(infoLog).toHaveBeenCalledWith({
                message:
                    'Departed-guild purge: no guild past the 7-day grace period',
            })
        })

        test.each(['0', '-3', 'abc', '1.5'])(
            'falls back to 30 days for invalid grace value %s',
            async (value) => {
                process.env.GUILD_DATA_PURGE_ENABLED = 'true'
                process.env.GUILD_DATA_PURGE_GRACE_DAYS = value
                mockPurgeDepartedGuildData.mockResolvedValue(
                    makeResult({
                        isFailure: false,
                        data: { guilds: 0, deleted: {} },
                    }),
                )

                await runOnce()

                expect(mockPurgeDepartedGuildData).toHaveBeenCalledWith(30)
            },
        )

        test('reports departed guilds with nothing left to delete (repeat run)', async () => {
            process.env.GUILD_DATA_PURGE_ENABLED = 'true'
            mockPurgeDepartedGuildData.mockResolvedValue(
                makeResult({
                    isFailure: false,
                    data: { guilds: 3, deleted: {} },
                }),
            )

            await runOnce()

            expect(infoLog).toHaveBeenCalledWith({
                message:
                    'Departed-guild purge removed data for 3 guild(s): nothing left to delete',
            })
        })

        test('logs an error and does not throw when the purge fails', async () => {
            process.env.GUILD_DATA_PURGE_ENABLED = 'true'
            const boom = new Error('purge boom')
            mockPurgeDepartedGuildData.mockResolvedValue(
                makeResult({ isFailure: true, error: boom }),
            )

            await runOnce()

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Departed-guild purge failed',
                error: boom,
            })
        })
    })
})
