import {
    describe,
    expect,
    it,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'

jest.mock('../../utils/general/log.js', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('../../utils/monitoring/sentry.js', () => ({
    captureMessageThrottled: jest.fn(),
}))

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn(),
}))

jest.mock('../redis/config.js', () => ({
    createRedisConfig: jest.fn(() => ({})),
}))

import { MusicControlService } from './MusicControlService.js'
import type {
    MusicCommand,
    MusicCommandResult,
    QueueState,
    RepeatMode,
} from './types.js'
import {
    CHANNEL_COMMAND,
    CHANNEL_STATE,
    CHANNEL_RESULT,
    STATE_KEY_PREFIX,
    STATE_TTL,
} from './types.js'
import { debugLog, errorLog, infoLog } from '../../utils/general/log.js'
import { captureMessageThrottled } from '../../utils/monitoring/sentry.js'

interface WithClients {
    publisher: any
    subscriber: any
    pendingResults: Map<string, any>
}

function buildCommand(overrides?: Partial<MusicCommand>): MusicCommand {
    return {
        id: 'cmd_' + Date.now(),
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'play',
        timestamp: Date.now(),
        ...overrides,
    }
}

function buildState(overrides?: Partial<QueueState>): QueueState {
    return {
        guildId: 'guild-1',
        currentTrack: null,
        tracks: [],
        isPlaying: false,
        isPaused: false,
        volume: 100,
        repeatMode: 'off' as RepeatMode,
        shuffled: false,
        position: 0,
        voiceChannelId: null,
        voiceChannelName: null,
        timestamp: Date.now(),
        ...overrides,
    }
}

describe('MusicControlService', () => {
    let mockPublish: jest.Mock
    let mockSubscribe: jest.Mock
    let mockConnect: jest.Mock
    let mockDisconnect: jest.Mock
    let mockGet: jest.Mock
    let mockSetex: jest.Mock
    let mockOn: jest.Mock
    let mockUnsubscribe: jest.Mock
    let RedisClientClass: jest.Mock
    let messageHandlers: Array<(...args: unknown[]) => void>

    beforeEach(() => {
        jest.clearAllMocks()
        messageHandlers = []
        mockPublish = jest.fn(async (): Promise<number> => 1)
        mockSubscribe = jest.fn(async (): Promise<void> => undefined)
        mockConnect = jest.fn(async (): Promise<void> => undefined)
        mockDisconnect = jest.fn(async (): Promise<void> => undefined)
        mockGet = jest.fn(async (): Promise<string | null> => null)
        mockSetex = jest.fn(async (): Promise<void> => undefined)
        mockUnsubscribe = jest.fn(async (): Promise<void> => undefined)
        mockOn = jest.fn((event, fn) => {
            if (event === 'message')
                messageHandlers.push(fn as (...args: unknown[]) => void)
        })

        RedisClientClass = require('ioredis').default
        RedisClientClass.mockImplementation(() => ({
            status: 'ready',
            connect: mockConnect,
            disconnect: mockDisconnect,
            publish: mockPublish,
            subscribe: mockSubscribe,
            unsubscribe: mockUnsubscribe,
            get: mockGet,
            setex: mockSetex,
            on: mockOn,
        }))
    })

    describe('health', () => {
        it('is unhealthy before connect()', () => {
            const service = new MusicControlService()
            expect(service.isHealthy()).toBe(false)
        })

        it('is healthy only when both clients are ready', () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'ready' }
            internals.subscriber = { status: 'reconnecting' }
            expect(service.isHealthy()).toBe(false)

            internals.subscriber = { status: 'ready' }
            expect(service.isHealthy()).toBe(true)
        })

        it('is unhealthy when publisher is null', () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = null
            internals.subscriber = { status: 'ready' }
            expect(service.isHealthy()).toBe(false)
        })

        it('is unhealthy when subscriber is null', () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = { status: 'ready' }
            internals.subscriber = null
            expect(service.isHealthy()).toBe(false)
        })
    })

    describe('connect', () => {
        it('connects both publisher and subscriber', async () => {
            const service = new MusicControlService()
            await service.connect()

            expect(mockConnect).toHaveBeenCalledTimes(2)
            expect(infoLog).toHaveBeenCalledWith({
                message: 'MusicControlService connected to Redis',
            })
        })

        it('logs error if connection fails', async () => {
            RedisClientClass.mockImplementationOnce(() => ({
                connect: jest.fn(() =>
                    Promise.reject(new Error('Connection failed')),
                ),
            }))

            const service = new MusicControlService()
            await service.connect()

            expect(errorLog).toHaveBeenCalledWith({
                message: 'MusicControlService failed to connect:',
                error: expect.any(Error),
            })
        })
    })

    describe('disconnect', () => {
        it('unsubscribes and disconnects subscriber', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                unsubscribe: mockUnsubscribe,
                disconnect: mockDisconnect,
            }

            await service.disconnect()

            expect(mockUnsubscribe).toHaveBeenCalled()
            expect(mockDisconnect).toHaveBeenCalled()
        })

        it('disconnects publisher', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = {
                disconnect: mockDisconnect,
            }

            await service.disconnect()

            expect(mockDisconnect).toHaveBeenCalled()
        })

        it('logs debug message on successful disconnect', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                unsubscribe: jest.fn(() => Promise.resolve()),
                disconnect: jest.fn(() => Promise.resolve()),
            }
            internals.publisher = {
                disconnect: jest.fn(() => Promise.resolve()),
            }

            await service.disconnect()

            expect(debugLog).toHaveBeenCalledWith({
                message: 'MusicControlService disconnected',
            })
        })

        it('logs error on disconnect failure', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                unsubscribe: jest.fn(() =>
                    Promise.reject(new Error('Disconnect failed')),
                ),
                disconnect: jest.fn(),
            }

            await service.disconnect()

            expect(errorLog).toHaveBeenCalledWith({
                message: 'MusicControlService disconnect error:',
                error: expect.any(Error),
            })
        })
    })

    describe('sendCommand', () => {
        it('fails fast with "Music service unavailable" when unhealthy', async () => {
            const service = new MusicControlService()
            const cmd = buildCommand()

            const result = await service.sendCommand(cmd)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Music service unavailable')
            expect(result.id).toBe(cmd.id)
            expect(result.guildId).toBe(cmd.guildId)
        })

        it('publishes command to Redis when healthy', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = {
                status: 'ready',
                publish: mockPublish,
            }
            internals.subscriber = { status: 'ready' }

            const cmd = buildCommand()
            const promise = service.sendCommand(cmd, 100)

            expect(mockPublish).toHaveBeenCalledWith(
                CHANNEL_COMMAND,
                JSON.stringify(cmd),
            )

            await promise
        })

        it('times out and cleans up if no result received', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = {
                status: 'ready',
                publish: mockPublish,
            }
            internals.subscriber = { status: 'ready' }

            const cmd = buildCommand()
            const result = await service.sendCommand(cmd, 10)

            expect(result.success).toBe(false)
            expect(result.error).toBe('Command timed out')
            expect(internals.pendingResults.has(cmd.id)).toBe(false)
        })

        it('removes pending result on publish error', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            ;(mockPublish as any).mockRejectedValueOnce(
                new Error('Publish failed'),
            )

            internals.publisher = {
                status: 'ready',
                publish: mockPublish,
            }
            internals.subscriber = { status: 'ready' }

            const cmd = buildCommand()
            const result = await service.sendCommand(cmd, 1000)

            expect(result.success).toBe(false)
            expect(result.error).toContain('Publish failed')
            expect(captureMessageThrottled).toHaveBeenCalledWith(
                'music:command:fail',
                expect.stringContaining('command publish failed'),
                'warning',
                expect.any(Object),
            )
        })

        it('uses default timeout of 10000ms', async () => {
            jest.useFakeTimers()

            try {
                const service = new MusicControlService()
                const internals = service as unknown as WithClients

                internals.publisher = {
                    status: 'ready',
                    publish: mockPublish,
                }
                internals.subscriber = { status: 'ready' }

                const cmd = buildCommand()
                const promise = service.sendCommand(cmd)

                expect(mockPublish).toHaveBeenCalled()

                // Advance timers by the default timeout
                jest.advanceTimersByTime(10000)

                // Result should be a timeout error
                const result = await promise
                expect(result.success).toBe(false)
                expect(result.error).toBe('Command timed out')
            } finally {
                jest.useRealTimers()
            }
        })
    })

    describe('subscribeToCommands', () => {
        it('subscribes to command channel', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn(async () => Promise.resolve())
            await service.subscribeToCommands(handler)

            expect(mockSubscribe).toHaveBeenCalledWith(CHANNEL_COMMAND)
            expect(infoLog).toHaveBeenCalledWith({
                message: 'Subscribed to music commands',
            })
        })

        it('calls handler when message received', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn(async (_cmd: MusicCommand) =>
                Promise.resolve(),
            )
            await service.subscribeToCommands(handler)

            const cmd = buildCommand()
            if (messageHandlers[0]) {
                await (
                    messageHandlers[0] as (
                        ch: string,
                        msg: string,
                    ) => Promise<void>
                )(CHANNEL_COMMAND, JSON.stringify(cmd))
            }

            expect(handler as any).toHaveBeenCalledWith(cmd)
        })

        it('ignores messages from other channels', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn(async () => Promise.resolve())
            await service.subscribeToCommands(handler)

            if (messageHandlers[0]) {
                await (
                    messageHandlers[0] as (
                        ch: string,
                        msg: string,
                    ) => Promise<void>
                )('other:channel', '{}')
            }

            expect(handler).not.toHaveBeenCalled()
        })

        it('handles handler errors gracefully', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const error = new Error('Handler failed')
            const handler = jest.fn(async (_cmd: MusicCommand) =>
                Promise.reject(error),
            )
            await service.subscribeToCommands(handler)

            const cmd = buildCommand()
            if (messageHandlers[0]) {
                await (
                    messageHandlers[0] as (
                        ch: string,
                        msg: string,
                    ) => Promise<void>
                )(CHANNEL_COMMAND, JSON.stringify(cmd))
            }

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling music command:',
                error,
            })
        })

        it('handles JSON parse errors', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn(async () => Promise.resolve())
            await service.subscribeToCommands(handler)

            if (messageHandlers[0]) {
                await (
                    messageHandlers[0] as (
                        ch: string,
                        msg: string,
                    ) => Promise<void>
                )(CHANNEL_COMMAND, 'invalid json')
            }

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling music command:',
                error: expect.any(Error),
            })
        })

        it('does nothing if subscriber is null', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients
            internals.subscriber = null

            const handler = jest.fn(async () => Promise.resolve())
            await service.subscribeToCommands(handler)

            expect(mockSubscribe).not.toHaveBeenCalled()
        })
    })

    describe('sendResult', () => {
        it('publishes result to Redis', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = {
                publish: mockPublish,
            }

            const result: MusicCommandResult = {
                id: 'cmd_1',
                guildId: 'guild-1',
                success: true,
                timestamp: Date.now(),
            }

            await service.sendResult(result)

            expect(mockPublish).toHaveBeenCalledWith(
                CHANNEL_RESULT,
                JSON.stringify(result),
            )
        })

        it('logs error if publish fails', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            const publishError = new Error('Publish failed')
            ;(mockPublish as any).mockRejectedValueOnce(publishError)

            internals.publisher = {
                publish: mockPublish,
            }

            const result: MusicCommandResult = {
                id: 'cmd_1',
                guildId: 'guild-1',
                success: true,
                timestamp: Date.now(),
            }

            await service.sendResult(result)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error publishing music result:',
                error: publishError,
            })
        })

        it('does nothing if publisher is null', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients
            internals.publisher = null

            const result: MusicCommandResult = {
                id: 'cmd_1',
                guildId: 'guild-1',
                success: true,
                timestamp: Date.now(),
            }

            await service.sendResult(result)

            expect(mockPublish).not.toHaveBeenCalled()
        })
    })

    describe('subscribeToResults', () => {
        it('subscribes to result channel', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            await service.subscribeToResults()

            expect(mockSubscribe).toHaveBeenCalledWith(CHANNEL_RESULT)
        })

        it('resolves pending command when result received', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                status: 'ready',
                subscribe: mockSubscribe,
                on: mockOn,
            }
            internals.publisher = {
                status: 'ready',
                publish: mockPublish,
            }
            ;(mockPublish as any).mockResolvedValueOnce(1)

            await service.subscribeToResults()

            const cmd = buildCommand()
            const resultPromise = service.sendCommand(cmd, 5000)

            // Simulate result message
            const result: MusicCommandResult = {
                id: cmd.id,
                guildId: cmd.guildId,
                success: true,
                timestamp: Date.now(),
            }

            if (messageHandlers[0]) {
                ;(messageHandlers[0] as (ch: string, msg: string) => void)(
                    CHANNEL_RESULT,
                    JSON.stringify(result),
                )
            }

            const receivedResult = await resultPromise

            expect(receivedResult).toEqual(result)
            expect(internals.pendingResults.has(cmd.id)).toBe(false)
        })

        it('ignores results with unknown command id', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            await service.subscribeToResults()

            const result: MusicCommandResult = {
                id: 'unknown-cmd-id',
                guildId: 'guild-1',
                success: true,
                timestamp: Date.now(),
            }

            if (messageHandlers[0]) {
                ;(messageHandlers[0] as (ch: string, msg: string) => void)(
                    CHANNEL_RESULT,
                    JSON.stringify(result),
                )
            }

            expect(errorLog).not.toHaveBeenCalled()
        })

        it('handles JSON parse errors', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            await service.subscribeToResults()

            if (messageHandlers[0]) {
                ;(messageHandlers[0] as (ch: string, msg: string) => void)(
                    CHANNEL_RESULT,
                    'invalid json',
                )
            }

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling music result:',
                error: expect.any(Error),
            })
        })

        it('does nothing if subscriber is null', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients
            internals.subscriber = null

            await service.subscribeToResults()

            expect(mockSubscribe).not.toHaveBeenCalled()
        })
    })

    describe('publishState', () => {
        it('publishes state to channel and cache', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.publisher = {
                publish: mockPublish,
                setex: mockSetex,
            }

            const state = buildState()

            await service.publishState(state)

            expect(mockPublish).toHaveBeenCalledWith(
                CHANNEL_STATE,
                JSON.stringify(state),
            )
            expect(mockSetex).toHaveBeenCalledWith(
                `${STATE_KEY_PREFIX}${state.guildId}`,
                STATE_TTL,
                JSON.stringify(state),
            )
        })

        it('logs error if publish fails', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            const publishError = new Error('Publish failed')
            ;(mockPublish as any).mockRejectedValueOnce(publishError)

            internals.publisher = {
                publish: mockPublish,
                setex: mockSetex,
            }

            const state = buildState()

            await service.publishState(state)

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error publishing music state:',
                error: publishError,
            })
        })

        it('does nothing if publisher is null', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients
            internals.publisher = null

            const state = buildState()

            await service.publishState(state)

            expect(mockPublish).not.toHaveBeenCalled()
        })
    })

    describe('subscribeToState', () => {
        it('subscribes to state channel', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn()
            await service.subscribeToState(handler)

            expect(mockSubscribe).toHaveBeenCalledWith(CHANNEL_STATE)
        })

        it('calls handler when state message received', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn()
            await service.subscribeToState(handler)

            const state = buildState()

            if (messageHandlers[0]) {
                ;(messageHandlers[0] as (ch: string, msg: string) => void)(
                    CHANNEL_STATE,
                    JSON.stringify(state),
                )
            }

            expect(handler).toHaveBeenCalledWith(state)
        })

        it('ignores messages from other channels', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn()
            await service.subscribeToState(handler)

            if (messageHandlers[0]) {
                ;(messageHandlers[0] as (ch: string, msg: string) => void)(
                    'other:channel',
                    '{}',
                )
            }

            expect(handler).not.toHaveBeenCalled()
        })

        it('handles JSON parse errors', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            internals.subscriber = {
                subscribe: mockSubscribe,
                on: mockOn,
            }

            const handler = jest.fn()
            await service.subscribeToState(handler)

            if (messageHandlers[0]) {
                ;(messageHandlers[0] as (ch: string, msg: string) => void)(
                    CHANNEL_STATE,
                    'invalid json',
                )
            }

            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error handling music state:',
                error: expect.any(Error),
            })
        })

        it('does nothing if subscriber is null', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients
            internals.subscriber = null

            const handler = jest.fn()
            await service.subscribeToState(handler)

            expect(mockSubscribe).not.toHaveBeenCalled()
        })
    })

    describe('getState', () => {
        it('retrieves state from cache by guild id', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            const state = buildState()
            ;(mockGet as any).mockResolvedValueOnce(JSON.stringify(state))

            internals.publisher = {
                get: mockGet,
            }

            const result = await service.getState(state.guildId)

            expect(mockGet).toHaveBeenCalledWith(
                `${STATE_KEY_PREFIX}${state.guildId}`,
            )
            expect(result).toEqual(state)
        })

        it('returns null when state not found', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            ;(mockGet as any).mockResolvedValueOnce(null)

            internals.publisher = {
                get: mockGet,
            }

            const result = await service.getState('guild-1')

            expect(result).toBeNull()
        })

        it('logs error if get fails', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients

            const getError = new Error('Get failed')
            ;(mockGet as any).mockRejectedValueOnce(getError)

            internals.publisher = {
                get: mockGet,
            }

            const result = await service.getState('guild-1')

            expect(result).toBeNull()
            expect(errorLog).toHaveBeenCalledWith({
                message: 'Error getting music state:',
                error: getError,
            })
        })

        it('returns null if publisher is null', async () => {
            const service = new MusicControlService()
            const internals = service as unknown as WithClients
            internals.publisher = null

            const result = await service.getState('guild-1')

            expect(result).toBeNull()
        })
    })

    describe('createCommandId', () => {
        it('creates unique command ids', () => {
            const id1 = MusicControlService.createCommandId()
            const id2 = MusicControlService.createCommandId()

            expect(id1).not.toBe(id2)
        })

        it('creates ids with cmd_ prefix', () => {
            const id = MusicControlService.createCommandId()

            expect(id).toMatch(/^cmd_/)
        })

        it('creates ids with timestamp and uuid components', () => {
            const id = MusicControlService.createCommandId()

            expect(id).toMatch(/^cmd_\d+_[a-f0-9]{7}$/)
        })

        it('generates valid ids on multiple calls', () => {
            for (let i = 0; i < 10; i++) {
                const id = MusicControlService.createCommandId()
                expect(id).toMatch(/^cmd_\d+_[a-f0-9]{7}$/)
            }
        })
    })
})
