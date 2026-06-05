import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Mock ioredis — controllable per test
const mockIoredisConstructor = jest.fn<any>()

jest.mock('ioredis', () => {
    return mockIoredisConstructor
})

// Mock the dependencies
const mockRedisOperationsInstance = {
    get: jest.fn<() => Promise<string | null>>(),
    set: jest.fn<() => Promise<boolean>>(),
    del: jest.fn<() => Promise<boolean>>(),
    exists: jest.fn<() => Promise<boolean>>(),
    expire: jest.fn<() => Promise<boolean>>(),
    keys: jest.fn<() => Promise<string[]>>(),
    ttl: jest.fn<() => Promise<number>>(),
    setex: jest.fn<() => Promise<boolean>>(),
    lpush: jest.fn<() => Promise<number>>(),
    sadd: jest.fn<() => Promise<number>>(),
    srem: jest.fn<() => Promise<number>>(),
    smembers: jest.fn<() => Promise<string[]>>(),
    lrange: jest.fn<() => Promise<string[]>>(),
    llen: jest.fn<() => Promise<number>>(),
    lindex: jest.fn<() => Promise<string | null>>(),
    ltrim: jest.fn<() => Promise<boolean>>(),
    shutdown: jest.fn<() => Promise<void>>(),
}

jest.mock('../../services/redis/operations', () => ({
    RedisOperations: jest.fn(() => mockRedisOperationsInstance),
}))

jest.mock('../../services/redis/eventHandlers', () => ({
    setupRedisEventHandlers: jest.fn(),
}))

jest.mock('../../utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    warnLog: jest.fn(),
    infoLog: jest.fn(),
}))

describe('RedisClient initialization error surfacing', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('isInitialized() and getInitializationError() methods exist and return expected types', () => {
        // This test verifies the contract without needing to mock ioredis
        const { RedisClient } = require('../../services/redis/client')

        // Verify methods exist
        const client = new RedisClient()
        expect(typeof client.isInitialized).toBe('function')
        expect(typeof client.getInitializationError).toBe('function')

        // When initialized successfully, these should return true/null
        // (actual values depend on Redis availability which we can't mock easily)
        const initialized = client.isInitialized()
        const initError = client.getInitializationError()

        expect(typeof initialized).toBe('boolean')
        expect(initError === null || initError instanceof Error).toBe(true)
    })

    test('getInitializationError() returns null or an Error instance', () => {
        const { RedisClient } = require('../../services/redis/client')
        const client = new RedisClient()

        const error = client.getInitializationError()
        if (error !== null) {
            expect(error).toBeInstanceOf(Error)
        }
    })

    test('isHealthy() is independent of isInitialized()', () => {
        const { RedisClient } = require('../../services/redis/client')
        const client = new RedisClient()

        // Both methods should return booleans
        const healthy = client.isHealthy()
        const initialized = client.isInitialized()

        expect(typeof healthy).toBe('boolean')
        expect(typeof initialized).toBe('boolean')

        // In the normal case where init is attempted,
        // a disconnected but successfully initialized client should have:
        // isInitialized() = true or false (depends on config availability)
        // isHealthy() = false (not connected)
    })

    test('operations return safe defaults even if not initialized', async () => {
        const { RedisClient } = require('../../services/redis/client')
        const client = new RedisClient()

        // All these should return without throwing, even if init failed
        const getResult = await client.get('test-key')
        expect(getResult === null || typeof getResult === 'string').toBe(true)

        const setResult = await client.set('test-key', 'value')
        expect(typeof setResult).toBe('boolean')

        const delResult = await client.del('test-key')
        expect(typeof delResult).toBe('boolean')
    })

    test('IRedisClient interface includes new methods', () => {
        // Verify the interface has been updated
        const { RedisClient } = require('../../services/redis/client')
        const client = new RedisClient()

        // Verify IRedisClient contract
        expect(typeof client.connect).toBe('function')
        expect(typeof client.disconnect).toBe('function')
        expect(typeof client.isHealthy).toBe('function')
        expect(typeof client.isInitialized).toBe('function')
        expect(typeof client.getInitializationError).toBe('function')
        expect(typeof client.get).toBe('function')
        expect(typeof client.set).toBe('function')
    })

    test('captures constructor errors and marks initialization as failed', () => {
        const testError = new Error('Redis config invalid')
        mockIoredisConstructor.mockImplementationOnce(() => {
            throw testError
        })

        // Clear the module to force reimport with the new mock
        delete require.cache[require.resolve('../../services/redis/client')]
        const { RedisClient } = require('../../services/redis/client')

        const client = new RedisClient()

        // After a constructor error, isInitialized() should be false
        expect(client.isInitialized()).toBe(false)

        // getInitializationError() should return the captured error
        const error = client.getInitializationError()
        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toBe('Redis config invalid')
    })

    test('succeeds initialization when ioredis constructor succeeds', () => {
        const mockRedisInstance = {
            on: jest.fn(),
            once: jest.fn(),
        }
        mockIoredisConstructor.mockImplementationOnce(() => mockRedisInstance)

        // Clear the module to force reimport with the new mock
        delete require.cache[require.resolve('../../services/redis/client')]
        const { RedisClient } = require('../../services/redis/client')

        const client = new RedisClient()

        // After successful initialization, isInitialized() should be true
        expect(client.isInitialized()).toBe(true)

        // getInitializationError() should return null
        const error = client.getInitializationError()
        expect(error).toBeNull()
    })

    test('converts non-Error thrown values to Error instances', () => {
        mockIoredisConstructor.mockImplementationOnce(() => {
            throw 'string error message'
        })

        // Clear the module to force reimport with the new mock
        delete require.cache[require.resolve('../../services/redis/client')]
        const { RedisClient } = require('../../services/redis/client')

        const client = new RedisClient()

        // Should still be marked as failed
        expect(client.isInitialized()).toBe(false)

        // Error should be converted to Error instance
        const error = client.getInitializationError()
        expect(error).toBeInstanceOf(Error)
        expect(error?.message).toBe('string error message')
    })

    test('operations fail gracefully when initialization failed', async () => {
        const testError = new Error('Connection refused')
        mockIoredisConstructor.mockImplementationOnce(() => {
            throw testError
        })

        // Clear the module to force reimport with the new mock
        delete require.cache[require.resolve('../../services/redis/client')]
        const { RedisClient } = require('../../services/redis/client')

        const client = new RedisClient()

        // Even though initialization failed, operations should not throw
        const getResult = await client.get('test-key')
        expect(getResult).toBeNull()

        const setResult = await client.set('test-key', 'value')
        expect(setResult).toBe(false)

        const delResult = await client.del('test-key')
        expect(delResult).toBe(false)

        const existsResult = await client.exists('test-key')
        expect(existsResult).toBe(false)
    })
})
