import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockPrisma = {
    logSettings: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
    },
} as any
jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

import { LogSettingsService } from '../LogSettingsService'

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'ls1',
        guildId: 'guild1',
        ignoredChannelIds: [],
        ignoredRoleIds: [],
        ignoredUserIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

describe('LogSettingsService', () => {
    let service: LogSettingsService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new LogSettingsService()
    })

    describe('getConfig', () => {
        it('returns the config for a guild', async () => {
            const config = makeConfig()
            mockPrisma.logSettings.findUnique.mockResolvedValue(config)

            const result = await service.getConfig('guild1')

            expect(result).toEqual(config)
            expect(mockPrisma.logSettings.findUnique).toHaveBeenCalledWith({
                where: { guildId: 'guild1' },
            })
        })

        it('returns null if unset', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(null)

            const result = await service.getConfig('guild1')

            expect(result).toBeNull()
        })
    })

    describe('addIgnored', () => {
        it('upserts, creating with the id in a fresh list when no config exists', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(null)
            mockPrisma.logSettings.upsert.mockResolvedValue(
                makeConfig({ ignoredChannelIds: ['c1'] }),
            )

            await service.addIgnored('guild1', 'channel', 'c1')

            expect(mockPrisma.logSettings.upsert).toHaveBeenCalledWith({
                where: { guildId: 'guild1' },
                create: { guildId: 'guild1', ignoredChannelIds: ['c1'] },
                update: { ignoredChannelIds: { push: 'c1' } },
            })
        })

        it('pushes onto the existing list', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(
                makeConfig({ ignoredRoleIds: ['r1'] }),
            )
            mockPrisma.logSettings.upsert.mockResolvedValue(
                makeConfig({ ignoredRoleIds: ['r1', 'r2'] }),
            )

            await service.addIgnored('guild1', 'role', 'r2')

            expect(mockPrisma.logSettings.upsert).toHaveBeenCalledWith({
                where: { guildId: 'guild1' },
                create: { guildId: 'guild1', ignoredRoleIds: ['r2'] },
                update: { ignoredRoleIds: { push: 'r2' } },
            })
        })

        it('is a no-op (skips the write) when the id is already present', async () => {
            const existing = makeConfig({ ignoredUserIds: ['u1'] })
            mockPrisma.logSettings.findUnique.mockResolvedValue(existing)

            const result = await service.addIgnored('guild1', 'user', 'u1')

            expect(result).toEqual(existing)
            expect(mockPrisma.logSettings.upsert).not.toHaveBeenCalled()
        })
    })

    describe('removeIgnored', () => {
        it('filters the id out of the list', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(
                makeConfig({ ignoredChannelIds: ['c1', 'c2'] }),
            )
            mockPrisma.logSettings.update.mockResolvedValue(
                makeConfig({ ignoredChannelIds: ['c2'] }),
            )

            await service.removeIgnored('guild1', 'channel', 'c1')

            expect(mockPrisma.logSettings.update).toHaveBeenCalledWith({
                where: { guildId: 'guild1' },
                data: { ignoredChannelIds: ['c2'] },
            })
        })

        it('returns null when no config exists', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(null)

            const result = await service.removeIgnored(
                'guild1',
                'channel',
                'c1',
            )

            expect(result).toBeNull()
            expect(mockPrisma.logSettings.update).not.toHaveBeenCalled()
        })
    })

    describe('isIgnored', () => {
        it('returns false when no config exists', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(null)

            const result = await service.isIgnored('guild1', {
                channelId: 'c1',
            })

            expect(result).toBe(false)
        })

        it('returns true when the channelId is ignored', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(
                makeConfig({ ignoredChannelIds: ['c1'] }),
            )

            const result = await service.isIgnored('guild1', {
                channelId: 'c1',
            })

            expect(result).toBe(true)
        })

        it('returns true when the userId is ignored', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(
                makeConfig({ ignoredUserIds: ['u1'] }),
            )

            const result = await service.isIgnored('guild1', { userId: 'u1' })

            expect(result).toBe(true)
        })

        it('returns true when any roleId is ignored', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(
                makeConfig({ ignoredRoleIds: ['r1'] }),
            )

            const result = await service.isIgnored('guild1', {
                roleIds: ['r0', 'r1'],
            })

            expect(result).toBe(true)
        })

        it('returns false when the target matches nothing ignored', async () => {
            mockPrisma.logSettings.findUnique.mockResolvedValue(
                makeConfig({
                    ignoredChannelIds: ['c1'],
                    ignoredRoleIds: ['r1'],
                    ignoredUserIds: ['u1'],
                }),
            )

            const result = await service.isIgnored('guild1', {
                channelId: 'c2',
                userId: 'u2',
                roleIds: ['r2'],
            })

            expect(result).toBe(false)
        })
    })
})
