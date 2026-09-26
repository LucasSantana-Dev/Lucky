import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'

const mockCleanupOldData = jest.fn<() => Promise<unknown>>()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    DatabaseService: jest.fn().mockImplementation(() => ({
        cleanupOldData: mockCleanupOldData,
    })),
}))

import { DataRetentionScheduler } from './dataRetentionScheduler'
import { infoLog, errorLog } from '@lucky/shared/utils'

function makeResult(overrides: {
    isFailure: boolean
    data?: number
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

beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
})

afterEach(() => {
    // Always clear the interval, even when an assertion above failed.
    scheduler?.stop()
    scheduler = undefined
    jest.useRealTimers()
})

describe('DataRetentionScheduler', () => {
    test('sweeps immediately on start and logs the deleted count', async () => {
        mockCleanupOldData.mockResolvedValue(makeResult({
            isFailure: false,
            data: 42,
        }))
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
        mockCleanupOldData.mockResolvedValue(makeResult({
            isFailure: true,
            error: boom,
        }))
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
        mockCleanupOldData.mockResolvedValue(makeResult({
            isFailure: false,
            data: 0,
        }))
        scheduler = new DataRetentionScheduler(20)

        scheduler.start({} as any)
        await jest.advanceTimersByTimeAsync(0)
        expect(mockCleanupOldData).toHaveBeenCalledTimes(1)

        await jest.advanceTimersByTimeAsync(20)
        expect(mockCleanupOldData).toHaveBeenCalledTimes(2)

    })
})
