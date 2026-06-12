import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { BotInitializer } from './initializer'
import type { CustomClient } from '../../types'

const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const warnLogMock = jest.fn()
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
const musicWatchdogStopMock = jest.fn()
const musicWatchdogStopPeriodicScanMock = jest.fn()
const startMetricsServerMock = jest.fn()
const stopMetricsServerMock = jest.fn().mockResolvedValue(undefined)
const setupWebMusicHandlerMock = jest.fn().mockResolvedValue(undefined)
const stopWebMusicHandlerMock = jest.fn()
const birthdaySchedulerStopMock = jest.fn()
const modDigestSchedulerStopMock = jest.fn()
const aiDevToolkitStopMock = jest.fn()
const dependencyCheckStopMock = jest.fn()
const stopTwitchServiceMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('../../handlers/clientHandler', () => ({
    createClient: (...args: unknown[]) => createClientMock(...args),
    startClient: (...args: unknown[]) => startClientMock(...args),
    stopPresenceRotation: jest.fn(),
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
        startOrphanSessionMonitor: (...args: unknown[]) =>
            musicWatchdogStartMock(...args),
        stopOrphanSessionMonitor: (...args: unknown[]) =>
            musicWatchdogStopMock(...args),
        stopPeriodicScan: (...args: unknown[]) =>
            musicWatchdogStopPeriodicScanMock(...args),
    },
}))

jest.mock('../../handlers/webMusic', () => ({
    setupWebMusicHandler: (...args: unknown[]) =>
        setupWebMusicHandlerMock(...args),
    stopWebMusicHandler: (...args: unknown[]) =>
        stopWebMusicHandlerMock(...args),
}))

jest.mock('../../utils/general/birthdayScheduler', () => ({
    birthdayScheduler: {
        stop: (...args: unknown[]) => birthdaySchedulerStopMock(...args),
    },
}))

jest.mock('../../utils/moderation/modDigestScheduler', () => ({
    modDigestSchedulerService: {
        stop: (...args: unknown[]) => modDigestSchedulerStopMock(...args),
    },
}))

jest.mock('../../services/AiDevToolkitService', () => ({
    aiDevToolkitService: {
        stop: (...args: unknown[]) => aiDevToolkitStopMock(...args),
    },
}))

jest.mock('../../services/DependencyCheckService', () => ({
    dependencyCheckService: {
        stop: (...args: unknown[]) => dependencyCheckStopMock(...args),
    },
}))

jest.mock('../../twitch', () => ({
    stopTwitchService: (...args: unknown[]) => stopTwitchServiceMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        connect: (...args: unknown[]) => redisClientConnectMock(...args),
        disconnect: (...args: unknown[]) => redisClientDisconnectMock(...args),
    },
}))

jest.mock('../../utils/monitoring/metricsServer', () => ({
    startMetricsServer: (...args: unknown[]) => startMetricsServerMock(...args),
    stopMetricsServer: (...args: unknown[]) => stopMetricsServerMock(...args),
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
        it('initializes bot successfully with default options', async () => {
            const result = await initializer.initializeBot()

            expect(result.success).toBe(true)
            expect(result.client).toBeDefined()
            expect(setupWebMusicHandlerMock).toHaveBeenCalledWith(result.client)
            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Bot initialization completed successfully',
                }),
            )
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
                }),
            )
        })

        it('continues startup in degraded mode when redis connection fails', async () => {
            redisClientConnectMock.mockResolvedValue(false)

            const result = await initializer.initializeBot()

            expect(result.success).toBe(true)
            expect(result.client).toBeDefined()
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Redis unavailable at startup',
                    ),
                }),
            )
            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Bot initialization completed successfully',
                }),
            )
        })

        it('returns error result when client creation fails', async () => {
            createClientMock.mockRejectedValue(
                new Error('Client creation failed'),
            )

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to create Discord client')
        })

        it('returns error result when provider health init fails', async () => {
            initProviderHealthMock.mockRejectedValue(
                new Error('Provider health failed'),
            )

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('tears down client when initialization fails after client creation', async () => {
            const mockClientInstance = {
                removeAllListeners: jest.fn(),
                destroy: jest.fn().mockResolvedValue(undefined),
                player: undefined,
            } as unknown as CustomClient
            createClientMock.mockResolvedValue(mockClientInstance)
            setCommandsMock.mockRejectedValue(
                new Error('Commands setup failed'),
            )

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()

            // Verify the client was destroyed
            expect(mockClientInstance.removeAllListeners).toHaveBeenCalled()
            expect(mockClientInstance.destroy).toHaveBeenCalled()

            // Verify state was reset after shutdown
            expect(initializer.isBotInitialized()).toBe(false)
            expect(initializer.getClient()).toBeNull()
        })

        it('tears down metrics server when initialization fails after client creation', async () => {
            setCommandsMock.mockRejectedValue(
                new Error('Commands setup failed'),
            )

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)

            // Verify stopMetricsServer was called during cleanup
            expect(stopMetricsServerMock).toHaveBeenCalled()
        })

        it('stops music watchdog when initialization fails after client creation', async () => {
            const mockClientInstance = {
                removeAllListeners: jest.fn(),
                destroy: jest.fn().mockResolvedValue(undefined),
                player: undefined,
            } as unknown as CustomClient
            createClientMock.mockResolvedValue(mockClientInstance)
            setCommandsMock.mockRejectedValue(
                new Error('Commands setup failed'),
            )

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)

            // Verify music watchdog monitor was stopped during cleanup
            expect(musicWatchdogStopMock).toHaveBeenCalled()
            // Verify client was destroyed after stopping watchdog
            expect(mockClientInstance.removeAllListeners).toHaveBeenCalled()
            expect(mockClientInstance.destroy).toHaveBeenCalled()
        })

        it('does not tear down if initialization fails before client creation', async () => {
            initProviderHealthMock.mockRejectedValue(
                new Error('Provider health failed'),
            )

            const result = await initializer.initializeBot()

            expect(result.success).toBe(false)

            // Verify client teardown was not called (no client was created yet)
            expect(createClientMock).not.toHaveBeenCalled()
            expect(initializer.getClient()).toBeNull()
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

        it('still clears client and state when destroy() throws', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            const client = initializer.getClient()
            ;(client?.destroy as jest.Mock).mockRejectedValueOnce(
                new Error('destroy failed'),
            )

            await initializer.shutdown()

            // A failed destroy must not leave stale state that blocks re-init.
            expect(initializer.getClient()).toBeNull()
            expect(initializer.isBotInitialized()).toBe(false)
            expect(initializer.getState().isInitialized).toBe(false)
        })

        it('silently succeeds when shutdown called with no client', async () => {
            expect(() => initializer.shutdown()).not.toThrow()
        })

        it('calls removeAllListeners before destroy', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            const client = initializer.getClient()
            const removeAllListenersMock =
                client?.removeAllListeners as jest.Mock
            const destroyMock = client?.destroy as jest.Mock

            await initializer.shutdown()

            expect(
                removeAllListenersMock.mock.invocationCallOrder[0],
            ).toBeLessThan(destroyMock.mock.invocationCallOrder[0])
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

    describe('shutdown — timer & scheduler cleanup', () => {
        it('stops every long-lived timer and scheduler', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            await initializer.shutdown()

            expect(stopWebMusicHandlerMock).toHaveBeenCalled()
            expect(birthdaySchedulerStopMock).toHaveBeenCalled()
            expect(modDigestSchedulerStopMock).toHaveBeenCalled()
            expect(aiDevToolkitStopMock).toHaveBeenCalled()
            expect(dependencyCheckStopMock).toHaveBeenCalled()
            expect(stopTwitchServiceMock).toHaveBeenCalled()
            expect(musicWatchdogStopMock).toHaveBeenCalled()
            expect(musicWatchdogStopPeriodicScanMock).toHaveBeenCalled()
            expect(stopMetricsServerMock).toHaveBeenCalled()
        })

        // Each stop is wrapped in its own try/catch so a single failure can't abort
        // the rest of teardown. Drive each throw and assert: error is logged AND the
        // client is still torn down (shutdown ran to completion).
        const failingStops: Array<[string, jest.Mock]> = [
            ['stopWebMusicHandler', stopWebMusicHandlerMock],
            ['birthdayScheduler.stop', birthdaySchedulerStopMock],
            ['modDigestSchedulerService.stop', modDigestSchedulerStopMock],
            ['aiDevToolkitService.stop', aiDevToolkitStopMock],
            ['dependencyCheckService.stop', dependencyCheckStopMock],
            ['stopTwitchService', stopTwitchServiceMock],
            ['stopOrphanSessionMonitor', musicWatchdogStopMock],
            ['stopPeriodicScan', musicWatchdogStopPeriodicScanMock],
        ]

        it.each(failingStops)(
            'continues shutdown when %s throws',
            async (_label, mockFn) => {
                const initResult = await initializer.initializeBot()
                expect(initResult.success).toBe(true)

                const client = initializer.getClient()
                mockFn.mockImplementationOnce(() => {
                    throw new Error('stop failed')
                })

                await initializer.shutdown()

                // The failure was caught and logged...
                expect(errorLogMock).toHaveBeenCalled()
                // ...and teardown still completed.
                expect(client?.destroy).toHaveBeenCalled()
                expect(initializer.getClient()).toBeNull()
                expect(initializer.isBotInitialized()).toBe(false)
            },
        )

        it('still stops metrics server when a scheduler throws', async () => {
            const initResult = await initializer.initializeBot()
            expect(initResult.success).toBe(true)

            birthdaySchedulerStopMock.mockImplementationOnce(() => {
                throw new Error('boom')
            })

            await initializer.shutdown()

            expect(stopMetricsServerMock).toHaveBeenCalled()
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
        it('initializes bot with player successfully', async () => {
            const mockPlayer = { type: 'player' }
            createPlayerMock.mockResolvedValue(mockPlayer)

            const result = await initializer.initializeBot()
            expect(result.success).toBe(true)
            expect(result.client).toBeDefined()
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
