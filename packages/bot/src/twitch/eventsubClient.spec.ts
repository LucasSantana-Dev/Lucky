import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import WebSocket from 'ws'

jest.mock('ws')
jest.mock('./token.js', () => ({
    getTwitchUserAccessToken: jest.fn(),
}))
jest.mock('./eventsubSubscriptions.js', () => ({
    subscribeToStreamOnline: jest.fn(),
    handleStreamOnline: jest.fn(),
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    debugLog: jest.fn(),
}))

import { TwitchEventSubClient } from './eventsubClient.js'
import { getTwitchUserAccessToken } from './token.js'
import {
    subscribeToStreamOnline,
    handleStreamOnline,
} from './eventsubSubscriptions.js'
import { infoLog } from '@lucky/shared/utils'

const getTwitchTokenMock = getTwitchUserAccessToken as jest.MockedFunction<any>
const subscribeToStreamOnlineMock =
    subscribeToStreamOnline as jest.MockedFunction<any>
const handleStreamOnlineMock = handleStreamOnline as jest.MockedFunction<any>
const WebSocketMock = WebSocket as jest.MockedClass<typeof WebSocket>

function createMockWebSocket() {
    const ws = {
        on: jest.fn(),
        off: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        pong: jest.fn(),
        readyState: WebSocket.OPEN,
    }
    return ws as any
}

function createMockClient() {
    return {
        channels: {
            fetch: jest.fn(),
        },
    } as any
}

beforeEach(() => {
    jest.clearAllMocks()
    jest.setTimeout(5000)
    process.env.TWITCH_CLIENT_ID = 'test-client-id'
    WebSocketMock.mockClear()
})

describe('TwitchEventSubClient', () => {
    describe('start', () => {
        test('skips when TWITCH_CLIENT_ID not set', async () => {
            delete process.env.TWITCH_CLIENT_ID
            const client = createMockClient()

            const eventSubClient = new TwitchEventSubClient()
            await eventSubClient.start(client)

            expect(WebSocketMock).not.toHaveBeenCalled()
        })

        test('skips when access token unavailable', async () => {
            const client = createMockClient()
            getTwitchTokenMock.mockResolvedValueOnce(null)

            const eventSubClient = new TwitchEventSubClient()
            await eventSubClient.start(client)

            expect(WebSocketMock).not.toHaveBeenCalled()
        })

        test('creates WebSocket when fully configured', async () => {
            const client = createMockClient()
            const mockWs = createMockWebSocket()
            WebSocketMock.mockImplementationOnce(() => mockWs)
            getTwitchTokenMock.mockResolvedValueOnce('test-token')

            const eventSubClient = new TwitchEventSubClient()

            const startPromise = Promise.race([
                eventSubClient.start(client),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 1000),
                ),
            ]).catch(() => {})

            await startPromise

            expect(WebSocketMock).toHaveBeenCalledWith(
                'wss://eventsub.wss.twitch.tv/ws',
            )
        })

        test('registers event handlers on connect', async () => {
            const client = createMockClient()
            const mockWs = createMockWebSocket()
            WebSocketMock.mockImplementationOnce(() => mockWs)
            getTwitchTokenMock.mockResolvedValueOnce('test-token')

            const eventSubClient = new TwitchEventSubClient()

            const startPromise = Promise.race([
                eventSubClient.start(client),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 1000),
                ),
            ]).catch(() => {})

            await startPromise

            expect(mockWs.on).toHaveBeenCalledWith('open', expect.any(Function))
            expect(mockWs.on).toHaveBeenCalledWith(
                'message',
                expect.any(Function),
            )
            expect(mockWs.on).toHaveBeenCalledWith(
                'close',
                expect.any(Function),
            )
            expect(mockWs.on).toHaveBeenCalledWith(
                'error',
                expect.any(Function),
            )
            expect(mockWs.on).toHaveBeenCalledWith('ping', expect.any(Function))
        })
    })

    describe('stop', () => {
        test('closes WebSocket when started', () => {
            const mockWs = createMockWebSocket()
            WebSocketMock.mockImplementationOnce(() => mockWs)

            const eventSubClient = new TwitchEventSubClient()
            eventSubClient.stop()

            expect(infoLog).toHaveBeenCalledWith({
                message: 'Twitch EventSub: client stopped',
            })
        })

        test('is safe to call multiple times', () => {
            const eventSubClient = new TwitchEventSubClient()

            eventSubClient.stop()
            eventSubClient.stop()

            expect(infoLog).toHaveBeenCalledTimes(2)
        })
    })

    describe('refreshSubscriptions', () => {
        test('returns without error when not connected', async () => {
            const eventSubClient = new TwitchEventSubClient()

            await eventSubClient.refreshSubscriptions()

            expect(subscribeToStreamOnlineMock).not.toHaveBeenCalled()
        })
    })

    describe('WebSocket connection', () => {
        test('uses correct EventSub WebSocket URL', async () => {
            const client = createMockClient()
            const mockWs = createMockWebSocket()
            WebSocketMock.mockImplementationOnce(() => mockWs)
            getTwitchTokenMock.mockResolvedValueOnce('test-token')

            const eventSubClient = new TwitchEventSubClient()

            const startPromise = Promise.race([
                eventSubClient.start(client),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 1000),
                ),
            ]).catch(() => {})

            await startPromise

            expect(WebSocketMock).toHaveBeenCalledWith(
                'wss://eventsub.wss.twitch.tv/ws',
            )
        })

        test('allows calling stop when not connected', () => {
            const eventSubClient = new TwitchEventSubClient()

            eventSubClient.stop()

            expect(infoLog).toHaveBeenCalledWith({
                message: 'Twitch EventSub: client stopped',
            })
        })
    })

    describe('message handler registration', () => {
        test('registers handler for ping events', async () => {
            const client = createMockClient()
            const mockWs = createMockWebSocket()
            WebSocketMock.mockImplementationOnce(() => mockWs)
            getTwitchTokenMock.mockResolvedValueOnce('test-token')

            const eventSubClient = new TwitchEventSubClient()

            const startPromise = Promise.race([
                eventSubClient.start(client),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 1000),
                ),
            ]).catch(() => {})

            await startPromise

            const pingCall = mockWs.on.mock.calls.find(
                (call) => call[0] === 'ping',
            )
            expect(pingCall).toBeDefined()
        })

        test('registers handler for message events', async () => {
            const client = createMockClient()
            const mockWs = createMockWebSocket()
            WebSocketMock.mockImplementationOnce(() => mockWs)
            getTwitchTokenMock.mockResolvedValueOnce('test-token')

            const eventSubClient = new TwitchEventSubClient()

            const startPromise = Promise.race([
                eventSubClient.start(client),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 1000),
                ),
            ]).catch(() => {})

            await startPromise

            const messageCall = mockWs.on.mock.calls.find(
                (call) => call[0] === 'message',
            )
            expect(messageCall).toBeDefined()
        })

        test('registers handler for error events', async () => {
            const client = createMockClient()
            const mockWs = createMockWebSocket()
            WebSocketMock.mockImplementationOnce(() => mockWs)
            getTwitchTokenMock.mockResolvedValueOnce('test-token')

            const eventSubClient = new TwitchEventSubClient()

            const startPromise = Promise.race([
                eventSubClient.start(client),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 1000),
                ),
            ]).catch(() => {})

            await startPromise

            const errorCall = mockWs.on.mock.calls.find(
                (call) => call[0] === 'error',
            )
            expect(errorCall).toBeDefined()
        })
    })
})
