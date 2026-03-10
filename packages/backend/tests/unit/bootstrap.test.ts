import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { redisClient } from '@lucky/shared/services'
import { ensureEnvironment } from '@lucky/shared/config'
import {
    initializeSentry,
    setupErrorHandlers,
    warnLog,
} from '@lucky/shared/utils'
import { bootstrapBackend } from '../../src/bootstrap'
import { startWebApp } from '../../src/server'

jest.mock('@lucky/shared/config', () => ({
    ensureEnvironment: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    initializeSentry: jest.fn(),
    setupErrorHandlers: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        connect: jest.fn(),
    },
}))

jest.mock('../../src/server', () => ({
    startWebApp: jest.fn(),
}))

describe('Backend Bootstrap', () => {
    const mockRedis = redisClient as jest.Mocked<typeof redisClient>
    const mockEnsureEnvironment = ensureEnvironment as jest.MockedFunction<
        typeof ensureEnvironment
    >
    const mockSetupErrorHandlers = setupErrorHandlers as jest.MockedFunction<
        typeof setupErrorHandlers
    >
    const mockInitializeSentry = initializeSentry as jest.MockedFunction<
        typeof initializeSentry
    >
    const mockWarnLog = warnLog as jest.MockedFunction<typeof warnLog>
    const mockStartWebApp = startWebApp as jest.MockedFunction<
        typeof startWebApp
    >

    beforeEach(() => {
        jest.clearAllMocks()
        mockEnsureEnvironment.mockResolvedValue(process.env)
        mockRedis.connect.mockResolvedValue(true)
    })

    test('connects redis before starting backend server', async () => {
        await bootstrapBackend()

        expect(mockEnsureEnvironment).toHaveBeenCalledTimes(1)
        expect(mockSetupErrorHandlers).toHaveBeenCalledTimes(1)
        expect(mockInitializeSentry).toHaveBeenCalledTimes(1)
        expect(mockRedis.connect).toHaveBeenCalledTimes(1)
        expect(mockStartWebApp).toHaveBeenCalledTimes(1)
    })

    test('continues startup when redis connect returns false', async () => {
        mockRedis.connect.mockResolvedValue(false)

        await bootstrapBackend()

        expect(mockWarnLog).toHaveBeenCalledTimes(1)
        expect(mockStartWebApp).toHaveBeenCalledTimes(1)
    })

    test('continues startup when redis connect throws', async () => {
        mockRedis.connect.mockRejectedValue(new Error('redis down'))

        await bootstrapBackend()

        expect(mockWarnLog).toHaveBeenCalledTimes(1)
        expect(mockStartWebApp).toHaveBeenCalledTimes(1)
    })
})
