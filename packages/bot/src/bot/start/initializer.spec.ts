import {
    describe,
    it,
    expect,
    beforeEach,
    jest,
} from '@jest/globals'
import { BotInitializer } from './initializer'
import type { CustomClient } from '../../types'

const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const createClientMock = jest.fn()
const startClientMock = jest.fn()
const createPlayerMock = jest.fn()
const getCommandsMock = jest.fn()
const setCommandsMock = jest.fn()
const handleEventsMock = jest.fn()
const initProviderHealthMock = jest.fn()
const redisClientConnectMock = jest.fn()
const redisClientDisconnectMock = jest.fn()
const musicWatchdogStartMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('../../handlers/clientHandler', () => ({
    createClient: (...args: unknown[]) => createClientMock(...args),
    startClient: (...args: unknown[]) => startClientMock(...args),
}))

jest.mock('../../handlers/playerHandler', () => ({
    createPlayer: (...args: unknown[]) => createPlayerMock(...args),
}))

jest.mock('../../handlers/commandsHandler', () => ({
    setCommands: (...args: unknown[]) => setCommandsMock(...args),
}))

jest.mock('../../register', () => ({
    getCommands: (...args: unknown[]) => getCommandsMock(...args),
}))

jest.mock('../../handlers/eventHandler', () => ({
    __esModule: true,
    default: (...args: unknown[]) => handleEventsMock(...args),
}))

jest.mock('../../utils/music/search/providerHealth', () => ({
    initProviderHealth: (...args: unknown[]) => initProviderHealthMock(...args),
}))

jest.mock('../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        startOrphanSessionMonitor: (...args: unknown[]) => musicWatchdogStartMock(...args),
    },
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        connect: (...args: unknown[]) => redisClientConnectMock(...args),
        disconnect: (...args: unknown[]) => redisClientDisconnectMock(...args),
    },
}))

describe('BotInitializer', () => {
    let initializer: BotInitializer

    beforeEach(() => {
        jest.clearAllMocks()
        initializer = new BotInitializer()
        redisClientConnectMock.mockResolvedValue(true)
        createClientMock.mockResolvedValue({
            removeAllListeners: jest.fn(),
            destroy: jest.fn().mockResolvedValue(undefined),
            player: undefined,
        } as unknown as CustomClient)
        createPlayerMock.mockResolvedValue({})
        getCommandsMock.mockResolvedValue([])
        setCommandsMock.mockResolvedValue(undefined)
        handleEventsMock.mockReturnValue(undefined)
        initProviderHealthMock.mockResolvedValue(undefined)
        startClientMock.mockResolvedValue(undefined)
    })

    describe('initializeBot', () => {
        it('initializes bot successfully with all services', async () => {
            const result = await initializer.initializeBot()

            expect(result.success).toBe(true)
            expect(result.client).toBeDefined()
            expect(redisClientConnectMock).toHaveBeenCalled()
            expect(initProviderHealthMock).toHaveBeenCalled()
            expect(createClientMock).toHaveBeenCalled()
            expect(createPlayerMock).toHaveBeenCalled()
            expect(getCommandsMock).toHaveBeenCalled()
            expect(setCommandsMock).toHaveBeenCalled()
            expect(handleEventsMock).toHaveBeenCalled()
            expect(startClientMock).toHaveBeenCalled()
            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Bot initialization completed successfully',
                })
            )
        })

        it('skips Redis initialization when skipRedis option is true', async () => {
            const result = await initializer.initializeBot({ skipRedis: true })

            expect(result.success).toBe(true)
            expect(redisClientConnectMock).not.toHaveBeenCalled()
        })

        it('skips player creation when skipPlayer option is true', async () => {
            const result = await initializer.initializeBot({ skipPlayer: true })

            expect(result.success).toBe(true)
            expect(createPlayerMock).not.toHaveBeenCalled()
        })

        it('skips commands setup when skipCommands option is true', async () => {
            const result = await initializer.initializeBot({ skipCommands: true })

            expect(result.success).toBe(true)
            expect(getCommandsMock).not.toHaveBeenCalled()
            expect(setCommandsMock).not.toHaveBeenCalled()
        })

        it('skips event handlers when skipEvents option is true', async () => {
            const result = await initializer.initializeBot({ skipEvents: true })

            expect(result.success).toBe(true)
            expect(handleEventsMock).not.toHaveBeenCalled()
        })

        it('returns cached client if already initialized', async () => {
            const firstResult = await initializer.initializeBot()
            const firstClientCallCount = createClientMock.mock.calls.length
            jest.clearAllMocks()

            const secondResult = await initializer.initializeBot()

            expect(firstResult.client).toBe(secondResult.client)
            expect(createClientMock).not.toHaveBeenCalled()
            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('already initialized'),
                })
            )
        })

        it('returns error result when redis connection fails', async () => {
            redisClientConnectMock.mockResolvedValue(false)

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('initialization failed'),
                })
            )
        })

        it('returns error result when client creation fails', async () => {
            createClientMock.mockRejectedValue(new Error('Client creation failed'))

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to create Discord client')
        })

        it('returns error result when provider health init fails', async () => {
            initProviderHealthMock.mockRejectedValue(new Error('Provider health failed'))

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('initializes bot state with correct flags', async () => {
            const result = await initializer.initializeBot()
            expect(result.success).toBe(true)

            const state = initializer.getState()
            expect(state.isInitialized).toBe(true)
            expect(state.isConnected).toBe(true)
            expect(state.isReady).toBe(true)
            expect(state.startTime).toBeDefined()
        })

        it('sets isInitialized flag correctly', async () => {
            expect(initializer.isBotInitialized()).toBe(false)

            const result = await initializer.initializeBot()
            expect(result.success).toBe(true)

            expect(initializer.isBotInitialized()).toBe(true)
        })

        it('returns client from getClient after initialization', async () => {
            expect(initializer.getClient()).toBeNull()

            const result = await initializer.initializeBot()
            expect(result.success).toBe(true)

            expect(initializer.getClient()).toBeDefined()
        })
    })

    describe('shutdown', () => {
        it('cleans up client and resets state', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            const client = initializer.getClient()

            await initializer.shutdown()

            expect(client?.removeAllListeners).toHaveBeenCalled()
            expect(client?.destroy).toHaveBeenCalled()
            expect(initializer.getClient()).toBeNull()
            expect(initializer.isBotInitialized()).toBe(false)
        })

        it('resets bot state after shutdown', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            let state = initializer.getState()
            expect(state.isInitialized).toBe(true)

            await initializer.shutdown()

            state = initializer.getState()
            expect(state.isInitialized).toBe(false)
            expect(state.isConnected).toBe(false)
            expect(state.isReady).toBe(false)
        })

        it('logs success on clean shutdown', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            await initializer.shutdown()

            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Bot shutdown completed',
                })
            )
        })

        it('handles errors during shutdown gracefully', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            const client = initializer.getClient()
            const destroyError = new Error('Destroy failed')
            ;(client?.destroy as jest.Mock).mockRejectedValue(destroyError)

            await initializer.shutdown()

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Error during bot shutdown'),
                })
            )
        })

        it('silently succeeds when shutdown called with no client', async () => {
            expect(() => initializer.shutdown()).not.toThrow()
        })

        it('calls removeAllListeners before destroy', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            const client = initializer.getClient()
            const removeAllListenersMock = client?.removeAllListeners as jest.Mock
            const destroyMock = client?.destroy as jest.Mock

            await initializer.shutdown()

            expect(removeAllListenersMock.mock.invocationCallOrder[0]).toBeLessThan(
                destroyMock.mock.invocationCallOrder[0]
            )
        })

        it('sets client to null after destroy', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            expect(initializer.getClient()).not.toBeNull()

            await initializer.shutdown()

            expect(initializer.getClient()).toBeNull()
        })

        it('allows multiple shutdown calls safely', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            await initializer.shutdown()
            await initializer.shutdown()

            expect(initializer.getClient()).toBeNull()
        })
    })

    describe('getClient', () => {
        it('returns null before initialization', () => {
            expect(initializer.getClient()).toBeNull()
        })

        it('returns client after initialization', async () => {
            const result = await initializer.initializeBot()
            expect(result.success).toBe(true)

            const client = initializer.getClient()

            expect(client).not.toBeNull()
            expect(client?.destroy).toBeDefined()
        })
    })

    describe('getState', () => {
        it('returns default state before initialization', () => {
            const state = initializer.getState()

            expect(state.isInitialized).toBe(false)
            expect(state.isConnected).toBe(false)
            expect(state.isReady).toBe(false)
        })

        it('returns copy of state not reference', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            const state1 = initializer.getState()
            const state2 = initializer.getState()

            expect(state1).toEqual(state2)
            expect(state1).not.toBe(state2)
        })
    })

    describe('isBotInitialized', () => {
        it('returns false before initialization', () => {
            expect(initializer.isBotInitialized()).toBe(false)
        })

        it('returns true after successful initialization', async () => {
            const result = await initializer.initializeBot()
            expect(result.success).toBe(true)

            expect(initializer.isBotInitialized()).toBe(true)
        })

        it('returns false after shutdown', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            await initializer.shutdown()

            expect(initializer.isBotInitialized()).toBe(false)
        })
    })

    describe('integration: player startup', () => {
        it('starts orphan session monitor when player is created', async () => {
            const mockPlayer = { type: 'player' }
            createPlayerMock.mockResolvedValue(mockPlayer)

            const result = await initializer.initializeBot()
            expect(result.success).toBe(true)

            expect(musicWatchdogStartMock).toHaveBeenCalledWith(mockPlayer)
        })

        it('does not start watchdog when skipPlayer is true', async () => {
            const result = await initializer.initializeBot({ skipPlayer: true })
            expect(result.success).toBe(true)

            expect(musicWatchdogStartMock).not.toHaveBeenCalled()
        })
    })

    describe('integration: full lifecycle', () => {
        it('completes full init-shutdown cycle', async () => {
            expect(initializer.isBotInitialized()).toBe(false)

            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)
            expect(initializer.isBotInitialized()).toBe(true)

            await initializer.shutdown()
            expect(initializer.isBotInitialized()).toBe(false)
            expect(initializer.getClient()).toBeNull()
        })
    })
})
