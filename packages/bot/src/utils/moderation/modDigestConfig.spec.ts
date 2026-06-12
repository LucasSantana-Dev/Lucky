import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ModDigestConfigService } from './modDigestConfig'

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@paralleldrive/cuid2', () => ({
    createId: jest.fn(() => 'test-id-1'),
    default: {
        createId: jest.fn(() => 'test-id-1'),
    },
}))

import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'

const mockPrisma = {
    modDigestConfig: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
    },
} as any

function createService() {
    return new ModDigestConfigService()
}

describe('ModDigestConfigService.enable', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma)
    })

    it('creates a new config row', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.upsert.mockResolvedValue({
            id: 'test-id-1',
            guildId: 'guild-1',
            channelId: 'channel-1',
            enabled: true,
            lastSentAt: null,
            createdAt: BigInt(1000),
            updatedAt: new Date(),
        })

        const config = await service.enable({
            guildId: 'guild-1',
            channelId: 'channel-1',
        })

        expect(config.guildId).toBe('guild-1')
        expect(config.channelId).toBe('channel-1')
        expect(config.enabled).toBe(true)
        expect(config.lastSentAt).toBeNull()
        expect(mockPrisma.modDigestConfig.upsert).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
            update: expect.any(Object),
            create: expect.any(Object),
        })
    })

    it('persists the supplied lastSentAt and createdAt atomically', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.upsert.mockResolvedValue({
            id: 'test-id-1',
            guildId: 'guild-1',
            channelId: 'channel-1',
            enabled: true,
            lastSentAt: BigInt(1234),
            createdAt: BigInt(5678),
            updatedAt: new Date(),
        })

        const config = await service.enable({
            guildId: 'guild-1',
            channelId: 'channel-1',
            lastSentAt: 1234,
            createdAt: 5678,
        })

        expect(config.lastSentAt).toBe(1234)
        expect(config.createdAt).toBe(5678)
    })
})

describe('ModDigestConfigService.disable', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma)
    })

    it('deletes the config row', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.findUnique.mockResolvedValue({
            id: 'test-id-1',
            guildId: 'guild-1',
            channelId: 'c',
            enabled: true,
            lastSentAt: null,
            createdAt: BigInt(1),
            updatedAt: new Date(),
        })
        mockPrisma.modDigestConfig.delete.mockResolvedValue({})

        const result = await service.disable('guild-1')

        expect(result).toBe(true)
        expect(mockPrisma.modDigestConfig.delete).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
        })
    })

    it('returns false when no config exists', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.findUnique.mockResolvedValue(null)

        const result = await service.disable('guild-1')

        expect(result).toBe(false)
        expect(mockPrisma.modDigestConfig.delete).not.toHaveBeenCalled()
    })
})

describe('ModDigestConfigService.get', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma)
    })

    it('returns config data converted from BigInt to number', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.findUnique.mockResolvedValue({
            id: 'test-id-1',
            guildId: 'g',
            channelId: 'c',
            enabled: true,
            lastSentAt: BigInt(123),
            createdAt: BigInt(1),
            updatedAt: new Date(),
        })

        const config = await service.get('g')

        expect(config?.guildId).toBe('g')
        expect(config?.channelId).toBe('c')
        expect(config?.lastSentAt).toBe(123)
        expect(config?.createdAt).toBe(1)
    })

    it('returns null when no config exists', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.findUnique.mockResolvedValue(null)

        const config = await service.get('missing')

        expect(config).toBeNull()
    })

    it('handles null lastSentAt', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.findUnique.mockResolvedValue({
            id: 'test-id-1',
            guildId: 'g',
            channelId: 'c',
            enabled: true,
            lastSentAt: null,
            createdAt: BigInt(1),
            updatedAt: new Date(),
        })

        const config = await service.get('g')

        expect(config?.lastSentAt).toBeNull()
    })
})

describe('ModDigestConfigService.listEnabledGuildIds', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma)
    })

    it('returns list of enabled guild IDs', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.findMany.mockResolvedValue([
            { guildId: 'guild-a' },
            { guildId: 'guild-b' },
        ])

        const ids = await service.listEnabledGuildIds()

        expect(ids).toEqual(['guild-a', 'guild-b'])
        expect(mockPrisma.modDigestConfig.findMany).toHaveBeenCalledWith({
            where: { enabled: true },
            select: { guildId: true },
        })
    })

    it('returns empty array on failure', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.findMany.mockRejectedValue(
            new Error('db error'),
        )

        const ids = await service.listEnabledGuildIds()

        expect(ids).toEqual([])
    })
})

describe('ModDigestConfigService.markSent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma)
    })

    it('updates lastSentAt when config exists', async () => {
        const service = createService()
        mockPrisma.modDigestConfig.update.mockResolvedValue({
            id: 'test-id-1',
            guildId: 'g',
            channelId: 'c',
            enabled: true,
            lastSentAt: BigInt(999),
            createdAt: BigInt(1),
            updatedAt: new Date(),
        })

        await service.markSent('g', 999)

        expect(mockPrisma.modDigestConfig.update).toHaveBeenCalledWith({
            where: { guildId: 'g' },
            data: {
                lastSentAt: BigInt(999),
                updatedAt: expect.any(Date),
            },
        })
    })

    it('silently succeeds when config is missing', async () => {
        const service = createService()
        const err = new Error('Record to update not found')
        mockPrisma.modDigestConfig.update.mockRejectedValue(err)

        // Should not throw
        await service.markSent('g', 999)
    })

    it('throws on other update errors', async () => {
        const service = createService()
        const err = new Error('other db error')
        mockPrisma.modDigestConfig.update.mockRejectedValue(err)

        await expect(service.markSent('g', 999)).rejects.toThrow('other db error')
    })
})
