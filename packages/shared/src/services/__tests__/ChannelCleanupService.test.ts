import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ChannelCleanupService } from '../ChannelCleanupService'
import { getPrismaClient } from '../../utils/database/prismaClient'

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: jest.fn(),
}))

describe('ChannelCleanupService', () => {
    let service: ChannelCleanupService
    let mockPrisma: any

    beforeEach(() => {
        jest.clearAllMocks()

        mockPrisma = {
            channelCleanupConfig: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                upsert: jest.fn(),
                updateMany: jest.fn(),
                update: jest.fn(),
            },
        }

        ;(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma)
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
        it('should return configs that are due for purge execution', async () => {
            const now = new Date()
            const mockConfigs = [
                {
                    id: 'config1',
                    mode: 'purge_interval',
                    enabled: true,
                    lastRunAt: null,
                },
                {
                    id: 'config2',
                    mode: 'purge_interval',
                    enabled: true,
                    lastRunAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 minutes ago
                },
            ]

            mockPrisma.channelCleanupConfig.findMany.mockResolvedValue(mockConfigs)

            const result = await service.getPurgeConfigsDue(5) // 5 minute interval

            expect(result).toEqual(mockConfigs)
            expect(mockPrisma.channelCleanupConfig.findMany).toHaveBeenCalled()
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
