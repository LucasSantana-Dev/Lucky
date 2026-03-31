import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import type { Client } from 'discord.js'

const isEnabledMock = jest.fn()
const isTwitchConfiguredMock = jest.fn()
const twitchEventSubClientStartMock = jest.fn()
const twitchEventSubClientStopMock = jest.fn()
const twitchEventSubClientRefreshMock = jest.fn()
const infoLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: isEnabledMock,
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: infoLogMock,
}))

jest.mock('./token', () => ({
    isTwitchConfigured: isTwitchConfiguredMock,
}))

jest.mock('./eventsubClient', () => ({
    twitchEventSubClient: {
        start: twitchEventSubClientStartMock,
        stop: twitchEventSubClientStopMock,
        refreshSubscriptions: twitchEventSubClientRefreshMock,
    },
}))

import {
    startTwitchService,
    stopTwitchService,
    refreshTwitchSubscriptions,
} from './index'

describe('twitch/index', () => {
    let mockDiscordClient: Partial<Client>

    beforeEach(() => {
        jest.clearAllMocks()
        mockDiscordClient = {}
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('startTwitchService', () => {
        it('should return early if feature is disabled', async () => {
            isEnabledMock.mockResolvedValue(false)

            await startTwitchService(mockDiscordClient as Client)

            expect(twitchEventSubClientStartMock).not.toHaveBeenCalled()
        })

        it('should return early if twitch is not configured', async () => {
            isEnabledMock.mockResolvedValue(true)
            isTwitchConfiguredMock.mockReturnValue(false)

            await startTwitchService(mockDiscordClient as Client)

            expect(twitchEventSubClientStartMock).not.toHaveBeenCalled()
        })

        it('should start eventsub client when enabled and configured', async () => {
            isEnabledMock.mockResolvedValue(true)
            isTwitchConfiguredMock.mockReturnValue(true)
            twitchEventSubClientStartMock.mockResolvedValue(undefined)

            await startTwitchService(mockDiscordClient as Client)

            expect(twitchEventSubClientStartMock).toHaveBeenCalledWith(
                mockDiscordClient,
            )
            expect(infoLogMock).toHaveBeenCalledWith({
                message: 'Twitch EventSub service started',
            })
        })

        it('should handle start errors gracefully', async () => {
            isEnabledMock.mockResolvedValue(true)
            isTwitchConfiguredMock.mockReturnValue(true)
            twitchEventSubClientStartMock.mockRejectedValue(
                new Error('Start failed'),
            )

            await startTwitchService(mockDiscordClient as Client)

            expect(infoLogMock).toHaveBeenCalledWith({
                message: 'Twitch EventSub service failed to start (non-fatal)',
                data: expect.any(Error),
            })
        })

        it('should pass discord client to eventsub client', async () => {
            isEnabledMock.mockResolvedValue(true)
            isTwitchConfiguredMock.mockReturnValue(true)
            twitchEventSubClientStartMock.mockResolvedValue(undefined)

            const customClient = { id: 'test-client' } as any

            await startTwitchService(customClient as Client)

            expect(twitchEventSubClientStartMock).toHaveBeenCalledWith(
                customClient,
            )
        })

        it('should check feature toggle without parameters', async () => {
            isEnabledMock.mockResolvedValue(false)
            isTwitchConfiguredMock.mockReturnValue(true)

            await startTwitchService(mockDiscordClient as Client)

            expect(isEnabledMock).toHaveBeenCalledWith('TWITCH_NOTIFICATIONS')
        })
    })

    describe('stopTwitchService', () => {
        it('should stop eventsub client', () => {
            stopTwitchService()

            expect(twitchEventSubClientStopMock).toHaveBeenCalled()
        })

        it('should call stop without arguments', () => {
            stopTwitchService()

            expect(twitchEventSubClientStopMock).toHaveBeenCalledWith()
        })
    })

    describe('refreshTwitchSubscriptions', () => {
        it('should refresh subscriptions', async () => {
            twitchEventSubClientRefreshMock.mockResolvedValue(undefined)

            await refreshTwitchSubscriptions()

            expect(twitchEventSubClientRefreshMock).toHaveBeenCalled()
        })

        it('should wait for refresh to complete', async () => {
            twitchEventSubClientRefreshMock.mockImplementation(
                () => new Promise((resolve) => setTimeout(resolve, 10)),
            )

            const startTime = Date.now()
            await refreshTwitchSubscriptions()
            const elapsed = Date.now() - startTime

            expect(elapsed).toBeGreaterThanOrEqual(10)
        })

        it('should handle refresh errors', async () => {
            twitchEventSubClientRefreshMock.mockRejectedValue(
                new Error('Refresh failed'),
            )

            await expect(refreshTwitchSubscriptions()).rejects.toThrow(
                'Refresh failed',
            )
        })
    })
})
