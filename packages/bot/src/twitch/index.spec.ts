import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Client } from 'discord.js'

const mockIsEnabled = jest.fn<() => Promise<boolean>>()
const mockIsConfigured = jest.fn<() => boolean>()
const mockGetTwitchEnv = jest.fn<
    () => {
        clientId: string
        clientSecret: string
        accessToken: string | undefined
        refreshToken: string | undefined
    }
>()
const mockStart = jest.fn<(c: Client) => Promise<void>>()
const mockStop = jest.fn<() => void>()
const mockRefresh = jest.fn<() => Promise<void>>()
const mockConnect = jest.fn<() => Promise<void>>()
const mockDisconnect = jest.fn<() => Promise<void>>()
const mockSubscribe = jest.fn<(h: () => Promise<void>) => Promise<void>>()
const mockIsHealthy = jest.fn<() => boolean>()
const mockWarnLog = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: { isEnabled: () => mockIsEnabled() },
    twitchControlService: {
        connect: () => mockConnect(),
        disconnect: () => mockDisconnect(),
        subscribeToRefresh: (h: () => Promise<void>) => mockSubscribe(h),
        isHealthy: () => mockIsHealthy(),
    },
}))

jest.mock('./token', () => ({
    isTwitchConfigured: () => mockIsConfigured(),
    getTwitchEnv: () => mockGetTwitchEnv(),
}))

jest.mock('./eventsubClient', () => ({
    twitchEventSubClient: {
        start: (c: Client) => mockStart(c),
        stop: () => mockStop(),
        refreshSubscriptions: () => mockRefresh(),
    },
}))

import {
    startTwitchService,
    stopTwitchService,
    refreshTwitchSubscriptions,
} from './index'

const client = {} as Client

describe('twitch/index', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockIsEnabled.mockResolvedValue(true)
        mockIsConfigured.mockReturnValue(true)
        mockGetTwitchEnv.mockReturnValue({
            clientId: 'client-id',
            clientSecret: 'client-secret',
            accessToken: 'access-token',
            refreshToken: undefined,
        })
        mockStart.mockResolvedValue(undefined)
        mockConnect.mockResolvedValue(undefined)
        mockSubscribe.mockResolvedValue(undefined)
        mockRefresh.mockResolvedValue(undefined)
        mockIsHealthy.mockReturnValue(true)
    })

    describe('startTwitchService', () => {
        it('does nothing when the feature toggle is disabled', async () => {
            mockIsEnabled.mockResolvedValue(false)

            await startTwitchService(client)

            expect(mockStart).not.toHaveBeenCalled()
            expect(mockConnect).not.toHaveBeenCalled()
        })

        it('does nothing when Twitch is not configured', async () => {
            mockIsConfigured.mockReturnValue(false)

            await startTwitchService(client)

            expect(mockStart).not.toHaveBeenCalled()
            expect(mockConnect).not.toHaveBeenCalled()
        })

        it('warns which env var(s) are missing when misconfigured', async () => {
            mockIsConfigured.mockReturnValue(false)
            mockGetTwitchEnv.mockReturnValue({
                clientId: 'client-id',
                clientSecret: '',
                accessToken: undefined,
                refreshToken: undefined,
            })

            await startTwitchService(client)

            expect(mockWarnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'TWITCH_CLIENT_SECRET, TWITCH_ACCESS_TOKEN',
                    ),
                }),
            )
        })

        it('starts EventSub and subscribes to refresh when healthy', async () => {
            await startTwitchService(client)

            expect(mockStart).toHaveBeenCalledWith(client)
            expect(mockConnect).toHaveBeenCalledTimes(1)
            expect(mockSubscribe).toHaveBeenCalledWith(
                refreshTwitchSubscriptions,
            )
        })

        it('does not subscribe when the control connection is unhealthy', async () => {
            mockIsHealthy.mockReturnValue(false)

            await startTwitchService(client)

            expect(mockConnect).toHaveBeenCalledTimes(1)
            expect(mockSubscribe).not.toHaveBeenCalled()
        })

        it('swallows EventSub start failures (non-fatal)', async () => {
            mockStart.mockRejectedValue(new Error('boom'))

            await expect(startTwitchService(client)).resolves.toBeUndefined()
            expect(mockSubscribe).not.toHaveBeenCalled()
        })
    })

    describe('stopTwitchService', () => {
        it('stops EventSub and disconnects the control connection', () => {
            stopTwitchService()

            expect(mockStop).toHaveBeenCalledTimes(1)
            expect(mockDisconnect).toHaveBeenCalledTimes(1)
        })
    })

    describe('refreshTwitchSubscriptions', () => {
        it('delegates to the EventSub client', async () => {
            await refreshTwitchSubscriptions()

            expect(mockRefresh).toHaveBeenCalledTimes(1)
        })
    })
})
