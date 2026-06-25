import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import type { Client, TextChannel } from 'discord.js'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    warnLog: jest.fn(),
    successLog: jest.fn(),
}))

jest.mock('../twitch/token')

import { CriativariaLiveNotificationService } from './CriativariaLiveNotificationService'

describe('CriativariaLiveNotificationService', () => {
    let service: CriativariaLiveNotificationService
    let mockClient: Partial<Client>
    let mockChannel: Partial<TextChannel>

    beforeEach(() => {
        mockChannel = {
            send: jest.fn(),
        }

        mockClient = {
            channels: {
                fetch: jest.fn(async () => mockChannel),
            },
        }

        service = new CriativariaLiveNotificationService(() => Date.now(), 1000)
        process.env.CRIATIVARIA_LIVES_CHANNEL_ID = 'test-channel-id'
        process.env.CRIATIVARIA_TWITCH_USER_LOGIN = 'criativaria'
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
    })

    afterEach(() => {
        jest.clearAllMocks()
        service.stop()
    })

    test('should not start when env vars are missing', async () => {
        delete process.env.CRIATIVARIA_LIVES_CHANNEL_ID
        const service2 = new CriativariaLiveNotificationService(
            () => Date.now(),
            1000,
        )
        service2.start(mockClient as Client)
        expect(mockClient.channels.fetch).not.toHaveBeenCalled()
        service2.stop()
    })

    test('should not notify when offline (no stream returned)', async () => {
        jest.spyOn(service, 'fetchStream').mockResolvedValue(null)

        await service.checkAndNotify(mockClient as Client)

        expect(mockChannel.send).not.toHaveBeenCalled()
    })

    test('should notify when stream is live with new stream ID', async () => {
        jest.spyOn(service, 'fetchStream').mockResolvedValue({
            id: 'stream-123',
            user_login: 'criativaria',
            title: 'Criativaria ao Vivo',
            viewer_count: 1500,
            game_name: 'Creative',
            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
            started_at: new Date().toISOString(),
        })

        await service.checkAndNotify(mockClient as Client)

        expect(mockChannel.send).toHaveBeenCalledTimes(1)
    })

    test('should not re-notify for same stream ID', async () => {
        jest.spyOn(service, 'fetchStream').mockResolvedValue({
            id: 'stream-123',
            user_login: 'criativaria',
            title: 'Criativaria ao Vivo',
            viewer_count: 1500,
            game_name: 'Creative',
            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
            started_at: new Date().toISOString(),
        })

        await service.checkAndNotify(mockClient as Client)
        expect(mockChannel.send).toHaveBeenCalledTimes(1)

        await service.checkAndNotify(mockClient as Client)
        expect(mockChannel.send).toHaveBeenCalledTimes(1)
    })

    test('should clear lastNotifiedStreamId when stream goes offline', async () => {
        jest.spyOn(service, 'fetchStream').mockResolvedValue({
            id: 'stream-123',
            user_login: 'criativaria',
            title: 'Criativaria ao Vivo',
            viewer_count: 1500,
            game_name: 'Creative',
            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
            started_at: new Date().toISOString(),
        })

        await service.checkAndNotify(mockClient as Client)
        expect(mockChannel.send).toHaveBeenCalledTimes(1)

        jest.spyOn(service, 'fetchStream').mockResolvedValue(null)
        await service.checkAndNotify(mockClient as Client)

        jest.spyOn(service, 'fetchStream').mockResolvedValue({
            id: 'stream-456',
            user_login: 'criativaria',
            title: 'Criativaria ao Vivo 2',
            viewer_count: 2000,
            game_name: 'Creative',
            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
            started_at: new Date().toISOString(),
        })
        await service.checkAndNotify(mockClient as Client)

        expect(mockChannel.send).toHaveBeenCalledTimes(2)
    })

    test('should handle send errors gracefully', async () => {
        jest.spyOn(service, 'fetchStream').mockResolvedValue({
            id: 'stream-123',
            user_login: 'criativaria',
            title: 'Criativaria ao Vivo',
            viewer_count: 1500,
            game_name: 'Creative',
            thumbnail_url: 'https://example.com/{width}x{height}.jpg',
            started_at: new Date().toISOString(),
        })

        jest.mocked(mockChannel.send).mockRejectedValue(
            new Error('Send failed'),
        )

        await expect(
            service.checkAndNotify(mockClient as Client),
        ).resolves.toBeUndefined()
    })

    test('should stop the interval when stop() is called', async () => {
        service.start(mockClient as Client)

        service.stop()

        expect((service as any).intervalHandle).toBeNull()
    })
})
