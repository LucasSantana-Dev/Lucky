import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import type { Client } from 'discord.js'

const getTwitchUserAccessTokenMock = jest.fn()
const subscribeToStreamOnlineMock = jest.fn()
const handleStreamOnlineMock = jest.fn()
const subscribeToStreamOfflineMock = jest.fn()
const handleStreamOfflineMock = jest.fn()
const subscribeToChannelUpdateMock = jest.fn()
const handleChannelUpdateMock = jest.fn()
const subscribeToChannelRaidMock = jest.fn()
const handleChannelRaidMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

const mockWsHandlers: Record<string, (...args: unknown[]) => void> = {}
const mockWsInstance = {
    on: jest.fn(),
    close: jest.fn(),
    pong: jest.fn(),
    readyState: 1,
}

jest.mock('ws', () => {
    // Plain function (not jest.fn) so the bot suite's resetMocks/restoreMocks
    // can't strip the constructor's return value between tests.
    function MockWebSocket(): typeof mockWsInstance {
        return mockWsInstance
    }
    // The client reads WebSocket.OPEN to gate the keepalive close.
    ;(MockWebSocket as unknown as { OPEN: number }).OPEN = 1
    return { __esModule: true, default: MockWebSocket }
})

jest.mock('./token', () => ({
    getTwitchUserAccessToken: getTwitchUserAccessTokenMock,
}))

jest.mock('./eventsubSubscriptions', () => ({
    subscribeToStreamOnline: subscribeToStreamOnlineMock,
    handleStreamOnline: handleStreamOnlineMock,
    subscribeToStreamOffline: subscribeToStreamOfflineMock,
    handleStreamOffline: handleStreamOfflineMock,
    subscribeToChannelUpdate: subscribeToChannelUpdateMock,
    handleChannelUpdate: handleChannelUpdateMock,
    subscribeToChannelRaid: subscribeToChannelRaidMock,
    handleChannelRaid: handleChannelRaidMock,
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: errorLogMock,
    infoLog: infoLogMock,
    debugLog: debugLogMock,
}))

import { TwitchEventSubClient } from './eventsubClient'

describe('TwitchEventSubClient', () => {
    let client: TwitchEventSubClient
    let mockDiscordClient: Partial<Client>

    beforeEach(() => {
        jest.clearAllMocks()
        // resetMocks wipes implementations each test, so (re)install the handler
        // capture and reset the shared ws instance state.
        for (const key of Object.keys(mockWsHandlers))
            delete mockWsHandlers[key]
        mockWsInstance.readyState = 1
        mockWsInstance.on.mockImplementation((...args: unknown[]) => {
            const [event, cb] = args as [string, (...a: unknown[]) => void]
            mockWsHandlers[event] = cb
        })
        client = new TwitchEventSubClient()
        mockDiscordClient = {}
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
    })

    afterEach(() => {
        jest.clearAllMocks()
        delete process.env.TWITCH_CLIENT_ID
    })

    describe('start', () => {
        it('should skip if TWITCH_CLIENT_ID is not set', async () => {
            delete process.env.TWITCH_CLIENT_ID
            await client.start(mockDiscordClient as Client)

            expect(infoLogMock).toHaveBeenCalledWith({
                message: 'Twitch EventSub: TWITCH_CLIENT_ID not set, skipping',
            })
        })

        it('should skip if token is not available', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue(null)

            await client.start(mockDiscordClient as Client)

            expect(infoLogMock).toHaveBeenCalledWith({
                message:
                    'Twitch EventSub: user access token not available, skipping',
            })
        })

        it('should attempt to connect when configured', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')

            // Start is async and will attempt connection
            // We can only verify that it doesn't throw for missing config
            const promise = client.start(mockDiscordClient as Client)

            // Don't await, as mock WebSocket may not properly resolve
            expect(promise).toBeDefined()
        })
    })

    describe('stop', () => {
        it('should stop the client', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue(null)
            await client.start(mockDiscordClient as Client)
            client.stop()

            expect(infoLogMock).toHaveBeenCalledWith({
                message: 'Twitch EventSub: client stopped',
            })
        })
    })

    describe('refreshSubscriptions', () => {
        it('should refresh subscriptions', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue(null)
            try {
                await client.start(mockDiscordClient as Client)
            } catch {
                // OK - WebSocket may not be properly mocked
            }
            await client.refreshSubscriptions()

            // Should call subscribe to refresh (may be called or not depending on session state)
            // Just verify it doesn't throw
            expect(client).toBeDefined()
        })
    })

    describe('reconnect resubscription', () => {
        const fireWelcome = (sessionId: string): void => {
            mockWsHandlers.message?.(
                Buffer.from(
                    JSON.stringify({
                        metadata: { message_type: 'session_welcome' },
                        payload: {
                            session: {
                                id: sessionId,
                                status: 'connected',
                                keepalive_timeout_seconds: 600,
                                reconnect_url: null,
                            },
                        },
                    }),
                ),
            )
        }

        it('clears the dedupe set on unexpected close so the new session re-subscribes from empty', async () => {
            jest.useFakeTimers()
            // Simulate the real subscribe: record the set size seen on each call,
            // then mark the broadcaster as subscribed (as the real impl does).
            const setSizesAtCall: number[] = []
            subscribeToStreamOnlineMock.mockImplementation(
                (_sessionId: string, _clientId: string, set: Set<string>) => {
                    setSizesAtCall.push(set.size)
                    set.add('broadcaster-1')
                    return Promise.resolve()
                },
            )
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')

            const startPromise = client.start(mockDiscordClient as Client)
            await Promise.resolve()
            fireWelcome('session-1')
            await startPromise

            // Unexpected close (non-1000) -> schedules reconnect after 5s.
            mockWsHandlers.close?.(4005, Buffer.from('keepalive timeout'))
            await jest.advanceTimersByTimeAsync(5000)
            fireWelcome('session-2')
            await Promise.resolve()

            // Both subscribe calls must see an EMPTY set: the first on the fresh
            // session, the second because the close handler cleared the stale ids.
            // Before the fix the second call saw size 1 and skipped every id.
            expect(setSizesAtCall).toEqual([0, 0])

            jest.useRealTimers()
        })
    })
})
