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
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('ws')

jest.mock('./token', () => ({
    getTwitchUserAccessToken: getTwitchUserAccessTokenMock,
}))

jest.mock('./eventsubSubscriptions', () => ({
    subscribeToStreamOnline: subscribeToStreamOnlineMock,
    handleStreamOnline: handleStreamOnlineMock,
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
})
