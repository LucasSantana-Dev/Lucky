import { describe, test, expect, jest, beforeEach } from '@jest/globals'

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

beforeEach(() => {
    jest.clearAllMocks()
})

describe('DataRetentionScheduler', () => {
    test('sweeps immediately on start and logs the deleted count', async () => {
        mockCleanupOldData.mockResolvedValue(makeResult({
            isFailure: false,
            data: 42,
        }))
        const scheduler = new DataRetentionScheduler(100)

        scheduler.start({} as any)
        // onStart's immediate tick is fire-and-forget; give it a turn.
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(mockCleanupOldData).toHaveBeenCalledTimes(1)
        expect(infoLog).toHaveBeenCalledWith({
            message: 'Data retention sweep deleted 42 row(s)',
        })
        expect(errorLog).not.toHaveBeenCalled()

        scheduler.stop()
    })

    test('logs an error and does not throw when the sweep fails', async () => {
        const boom = new Error('boom')
        mockCleanupOldData.mockResolvedValue(makeResult({
            isFailure: true,
            error: boom,
        }))
        const scheduler = new DataRetentionScheduler(100)

        scheduler.start({} as any)
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(errorLog).toHaveBeenCalledWith({
            message: 'Data retention sweep failed',
            error: boom,
        })
        expect(infoLog).not.toHaveBeenCalled()

        scheduler.stop()
    })

    test('ticks again on the configured interval', async () => {
        mockCleanupOldData.mockResolvedValue(makeResult({
            isFailure: false,
            data: 0,
        }))
        const scheduler = new DataRetentionScheduler(20)

        scheduler.start({} as any)
        await new Promise((resolve) => setTimeout(resolve, 70))

        expect(mockCleanupOldData.mock.calls.length).toBeGreaterThan(1)

        scheduler.stop()
    })
})
