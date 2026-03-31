import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
}))

jest.mock('./token.js', () => ({
    isTwitchConfigured: jest.fn(),
}))

jest.mock('./eventsubClient.js', () => ({
    twitchEventSubClient: {
        start: jest.fn(),
        stop: jest.fn(),
        refreshSubscriptions: jest.fn(),
    },
}))

import {
    startTwitchService,
    stopTwitchService,
    refreshTwitchSubscriptions,
} from './index.js'
import { featureToggleService } from '@lucky/shared/services'
import { isTwitchConfigured } from './token.js'
import { twitchEventSubClient } from './eventsubClient.js'
import { infoLog } from '@lucky/shared/utils'

const featureToggleMock =
    featureToggleService.isEnabled as jest.MockedFunction<any>
const isTwitchConfiguredMock = isTwitchConfigured as jest.MockedFunction<any>
const startMock = twitchEventSubClient.start as jest.MockedFunction<any>
const stopMock = twitchEventSubClient.stop as jest.MockedFunction<any>
const refreshMock =
    twitchEventSubClient.refreshSubscriptions as jest.MockedFunction<any>
const infoLogMock = infoLog as jest.MockedFunction<any>

function createMockClient() {
    return {} as any
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('twitch module', () => {
    describe('startTwitchService', () => {
        test('starts EventSub client when enabled and configured', async () => {
            const client = createMockClient()
            featureToggleMock.mockResolvedValueOnce(true)
            isTwitchConfiguredMock.mockReturnValueOnce(true)
            startMock.mockResolvedValueOnce(undefined)

            await startTwitchService(client)

            expect(startMock).toHaveBeenCalledWith(client)
            expect(infoLogMock).toHaveBeenCalledWith({
                message: 'Twitch EventSub service started',
            })
        })

        test('skips when feature is disabled', async () => {
            const client = createMockClient()
            featureToggleMock.mockResolvedValueOnce(false)

            await startTwitchService(client)

            expect(startMock).not.toHaveBeenCalled()
        })

        test('skips when not configured', async () => {
            const client = createMockClient()
            featureToggleMock.mockResolvedValueOnce(true)
            isTwitchConfiguredMock.mockReturnValueOnce(false)

            await startTwitchService(client)

            expect(startMock).not.toHaveBeenCalled()
        })

        test('skips when both disabled and not configured', async () => {
            const client = createMockClient()
            featureToggleMock.mockResolvedValueOnce(false)
            isTwitchConfiguredMock.mockReturnValueOnce(false)

            await startTwitchService(client)

            expect(startMock).not.toHaveBeenCalled()
        })

        test('logs non-fatal error if start fails', async () => {
            const client = createMockClient()
            const testError = new Error('Start failed')
            featureToggleMock.mockResolvedValueOnce(true)
            isTwitchConfiguredMock.mockReturnValueOnce(true)
            startMock.mockRejectedValueOnce(testError)

            await startTwitchService(client)

            expect(infoLogMock).toHaveBeenCalledWith({
                message: 'Twitch EventSub service failed to start (non-fatal)',
                data: testError,
            })
        })

        test('checks feature toggle', async () => {
            const client = createMockClient()
            featureToggleMock.mockResolvedValueOnce(true)
            isTwitchConfiguredMock.mockReturnValueOnce(true)
            startMock.mockResolvedValueOnce(undefined)

            await startTwitchService(client)

            expect(featureToggleMock).toHaveBeenCalledWith(
                'TWITCH_NOTIFICATIONS',
            )
        })
    })

    describe('stopTwitchService', () => {
        test('stops EventSub client', () => {
            stopTwitchService()

            expect(stopMock).toHaveBeenCalled()
        })
    })

    describe('refreshTwitchSubscriptions', () => {
        test('calls eventSubClient refresh', async () => {
            refreshMock.mockResolvedValueOnce(undefined)

            await refreshTwitchSubscriptions()

            expect(refreshMock).toHaveBeenCalled()
        })

        test('returns successfully', async () => {
            refreshMock.mockResolvedValueOnce(undefined)

            const result = await refreshTwitchSubscriptions()

            expect(result).toBeUndefined()
        })
    })
})
