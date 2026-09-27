import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockPrisma = {
    twitchNotification: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
    },
} as any
jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

import { TwitchNotificationService } from '../TwitchNotificationService/index'

describe('TwitchNotificationService', () => {
    let service: TwitchNotificationService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new TwitchNotificationService()
    })

    describe('add', () => {
        it('returns true when the upsert succeeds', async () => {
            mockPrisma.twitchNotification.upsert.mockResolvedValue({
                id: 'n1',
            })

            const result = await service.add(
                'guild1',
                'channel1',
                'tw123',
                'streamer1',
            )

            expect(result).toBe(true)
        })

        it('returns false when the upsert throws', async () => {
            mockPrisma.twitchNotification.upsert.mockRejectedValue(
                new Error('db unavailable'),
            )

            const result = await service.add(
                'guild1',
                'channel1',
                'tw123',
                'streamer1',
            )

            expect(result).toBe(false)
        })
    })

    describe('remove', () => {
        it('returns true when a row was deleted', async () => {
            mockPrisma.twitchNotification.deleteMany.mockResolvedValue({
                count: 1,
            })

            const result = await service.remove('guild1', 'tw123')

            expect(result).toBe(true)
        })

        it('returns false when nothing matched', async () => {
            mockPrisma.twitchNotification.deleteMany.mockResolvedValue({
                count: 0,
            })

            const result = await service.remove('guild1', 'tw123')

            expect(result).toBe(false)
        })

        it('returns false when the delete throws', async () => {
            mockPrisma.twitchNotification.deleteMany.mockRejectedValue(
                new Error('db unavailable'),
            )

            const result = await service.remove('guild1', 'tw123')

            expect(result).toBe(false)
        })
    })
})
