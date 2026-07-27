import { describe, expect, it, jest, beforeEach } from '@jest/globals'

// The service captures prisma at module load, so the factory must hand back
// the mock at import time (module-level `const prisma = getPrismaClient()`).
const mockPrisma = {
    channelCleanupConfig: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
    },
} as any
jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

import { ChannelCleanupService } from '../ChannelCleanupService'

describe('ChannelCleanupService', () => {
    let service: ChannelCleanupService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new ChannelCleanupService()
    })

    describe('getConfig', () => {
        it('should retrieve config by guildId and channelId', async () => {
            const mockConfig = {
                id: 'config1',
                guildId: 'guild1',
                channelId: 'channel1',
                mode: 'ttl',
                ttlSeconds: 60,
                intervalMinutes: null,
                enabled: true,
                lastRunAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            mockPrisma.channelCleanupConfig.findUnique.mockResolvedValue(mockConfig)

            const result = await service.getConfig('guild1', 'channel1')

            expect(result).toEqual(mockConfig)
            expect(mockPrisma.channelCleanupConfig.findUnique).toHaveBeenCalledWith({
                where: { guildId_channelId: { guildId: 'guild1', channelId: 'channel1' } },
            })
        })

        it('should return null if config does not exist', async () => {
            mockPrisma.channelCleanupConfig.findUnique.mockResolvedValue(null)

            const result = await service.getConfig('guild1', 'channel1')

            expect(result).toBeNull()
        })
    })

    describe('getGuildConfigs', () => {
        it('should retrieve all enabled configs for a guild', async () => {
            const mockConfigs = [
                {
                    id: 'config1',
                    guildId: 'guild1',
                    channelId: 'channel1',
                    mode: 'ttl',
                    enabled: true,
                },
                {
                    id: 'config2',
                    guildId: 'guild1',
                    channelId: 'channel2',
                    mode: 'purge_interval',
                    enabled: true,
                },
            ]

            mockPrisma.channelCleanupConfig.findMany.mockResolvedValue(mockConfigs)

            const result = await service.getGuildConfigs('guild1')

            expect(result).toEqual(mockConfigs)
            expect(mockPrisma.channelCleanupConfig.findMany).toHaveBeenCalledWith({
                where: { guildId: 'guild1', enabled: true },
            })
        })
    })

    describe('upsertConfig', () => {
        it('should create or update a config', async () => {
            const mockConfig = {
                id: 'config1',
                guildId: 'guild1',
                channelId: 'channel1',
                mode: 'ttl',
                ttlSeconds: 60,
                intervalMinutes: null,
                enabled: true,
                lastRunAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            mockPrisma.channelCleanupConfig.upsert.mockResolvedValue(mockConfig)

            const result = await service.upsertConfig('guild1', 'channel1', {
                mode: 'ttl',
                ttlSeconds: 60,
            })

            expect(result).toEqual(mockConfig)
            expect(mockPrisma.channelCleanupConfig.upsert).toHaveBeenCalledWith({
                where: { guildId_channelId: { guildId: 'guild1', channelId: 'channel1' } },
                create: {
                    guildId: 'guild1',
                    channelId: 'channel1',
                    mode: 'ttl',
                    ttlSeconds: 60,
                },
                update: {
                    mode: 'ttl',
                    ttlSeconds: 60,
                },
            })
        })
    })

    describe('disableCleanup', () => {
        it('should disable cleanup for a channel', async () => {
            await service.disableCleanup('guild1', 'channel1')

            expect(mockPrisma.channelCleanupConfig.updateMany).toHaveBeenCalledWith({
                where: { guildId: 'guild1', channelId: 'channel1' },
                data: { enabled: false },
            })
        })
    })

    describe('listConfigs', () => {
        it('should list all configs for a guild ordered by creation', async () => {
            const mockConfigs = [
                {
                    id: 'config2',
                    guildId: 'guild1',
                    channelId: 'channel2',
                    createdAt: new Date('2026-07-03'),
                },
                {
                    id: 'config1',
                    guildId: 'guild1',
                    channelId: 'channel1',
                    createdAt: new Date('2026-07-02'),
                },
            ]

            mockPrisma.channelCleanupConfig.findMany.mockResolvedValue(mockConfigs)

            const result = await service.listConfigs('guild1')

            expect(result).toEqual(mockConfigs)
            expect(mockPrisma.channelCleanupConfig.findMany).toHaveBeenCalledWith({
                where: { guildId: 'guild1' },
                orderBy: { createdAt: 'desc' },
            })
        })
    })

    describe('getPurgeConfigsDue', () => {
        it('honors each config own interval and asserts the query filter', async () => {
            const now = Date.now()
            const mockConfigs = [
                // never run -> due
                {
                    id: 'config1',
                    mode: 'purge_interval',
                    enabled: true,
                    intervalMinutes: 60,
                    lastRunAt: null,
                },
                // 60-min interval, ran 10 min ago -> NOT due (review P1)
                {
                    id: 'config2',
                    mode: 'purge_interval',
                    enabled: true,
                    intervalMinutes: 60,
                    lastRunAt: new Date(now - 10 * 60 * 1000),
                },
                // 60-min interval, ran 61 min ago -> due
                {
                    id: 'config3',
                    mode: 'purge_interval',
                    enabled: true,
                    intervalMinutes: 60,
                    lastRunAt: new Date(now - 61 * 60 * 1000),
                },
                // invalid interval -> never due
                {
                    id: 'config4',
                    mode: 'purge_interval',
                    enabled: true,
                    intervalMinutes: null,
                    lastRunAt: null,
                },
            ]

            mockPrisma.channelCleanupConfig.findMany.mockResolvedValue(
                mockConfigs,
            )

            const result = await service.getPurgeConfigsDue()

            expect(
                mockPrisma.channelCleanupConfig.findMany,
            ).toHaveBeenCalledWith({
                where: { enabled: true, mode: 'purge_interval' },
            })
            expect(result.map((c: { id: string }) => c.id)).toEqual([
                'config1',
                'config3',
            ])
        })
    })

    describe('markPurgeExecuted', () => {
        it('should update lastRunAt timestamp', async () => {
            const mockConfig = {
                id: 'config1',
                lastRunAt: expect.any(Date),
            }

            mockPrisma.channelCleanupConfig.update.mockResolvedValue(mockConfig)

            await service.markPurgeExecuted('config1')

            expect(mockPrisma.channelCleanupConfig.update).toHaveBeenCalledWith({
                where: { id: 'config1' },
                data: { lastRunAt: expect.any(Date) },
            })
        })
    })
})
