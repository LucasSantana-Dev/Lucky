import { describe, test, expect, beforeEach, jest } from '@jest/globals'

// Service captures getPrismaClient() lazily per call; mock returns a stable client.
const mockUpsert = jest.fn<any>()
const mockFindUnique = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()
const mockPrisma = {
    guildSettings: {
        upsert: mockUpsert,
        findUnique: mockFindUnique,
        deleteMany: mockDeleteMany,
    },
}

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    disconnectPrisma: jest.fn(),
}))

import { GuildSettingsService } from '../../services/GuildSettingsService'

describe('GuildSettingsService settings (Postgres source of truth)', () => {
    let service: GuildSettingsService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new GuildSettingsService()
    })

    test('updateGuildSettings upserts only the provided fields', async () => {
        mockUpsert.mockResolvedValue({})

        const result = await service.updateGuildSettings('guild-1', {
            autoplayGenres: ['rock', 'jazz'],
        })

        expect(result).toBe(true)
        expect(mockUpsert).toHaveBeenCalledTimes(1)
        const arg = mockUpsert.mock.calls[0][0] as any
        expect(arg.where).toEqual({ guildId: 'guild-1' })
        // Only the provided field is in the data — no birthday columns clobbered.
        expect(arg.update).toEqual({ autoplayGenres: ['rock', 'jazz'] })
        expect(arg.create).toEqual({
            guildId: 'guild-1',
            autoplayGenres: ['rock', 'jazz'],
        })
    })

    test('setGuildSettings writes the new DJ/idle/voteskip columns', async () => {
        mockUpsert.mockResolvedValue({})

        await service.setGuildSettings('guild-1', {
            djRoleId: 'role-9',
            idleTimeoutMinutes: 15,
            voteSkipThreshold: 60,
        })

        const arg = mockUpsert.mock.calls[0][0] as any
        expect(arg.update).toEqual({
            djRoleId: 'role-9',
            idleTimeoutMinutes: 15,
            voteSkipThreshold: 60,
        })
    })

    test('getGuildSettings maps a row, coalescing nullable columns', async () => {
        mockFindUnique.mockResolvedValue({
            guildId: 'guild-1',
            defaultVolume: 80,
            maxQueueSize: 100,
            autoPlayEnabled: true,
            autoplayMode: 'discover',
            autoplayGenres: ['rock'],
            repeatMode: 0,
            shuffleEnabled: false,
            prefix: null, // -> default '/'
            embedColor: null, // -> default
            language: 'en',
            allowDownloads: true,
            allowPlaylists: true,
            allowSpotify: true,
            commandCooldown: 3,
            downloadCooldown: 10,
            djRoleId: null, // -> undefined
            idleTimeoutMinutes: null, // -> 0
            voteSkipThreshold: null, // -> 50
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        const s = await service.getGuildSettings('guild-1')
        expect(s).not.toBeNull()
        expect(s!.defaultVolume).toBe(80)
        expect(s!.prefix).toBe('/')
        expect(s!.djRoleId).toBeUndefined()
        expect(s!.idleTimeoutMinutes).toBe(0)
        expect(s!.voteSkipThreshold).toBe(50)
    })

    test('getGuildSettings returns null when no row exists', async () => {
        mockFindUnique.mockResolvedValue(null)
        expect(await service.getGuildSettings('nope')).toBeNull()
    })

    test('returns false when the DB write throws', async () => {
        mockUpsert.mockRejectedValue(new Error('db down'))
        const result = await service.updateGuildSettings('guild-1', {
            autoplayGenres: ['rock'],
        })
        expect(result).toBe(false)
    })

    test('deleteGuildSettings removes the row', async () => {
        mockDeleteMany.mockResolvedValue({ count: 1 })
        expect(await service.deleteGuildSettings('guild-1')).toBe(true)
        expect(mockDeleteMany).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
        })
    })
})
