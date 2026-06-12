import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'

const mockFindUnique = jest.fn<any>()
const mockCreate = jest.fn<any>()
const mockUpsert = jest.fn<any>()
const mockPrisma = {
    autoModSettings: {
        findUnique: mockFindUnique,
        create: mockCreate,
        upsert: mockUpsert,
    },
}

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    disconnectPrisma: jest.fn(),
}))

import {
    AutoModService,
    _resetSpamWindows,
    _resetSettingsCache,
} from '../../services/AutoModService'

describe('AutoModService', () => {
    let service: AutoModService

    const mockSettings = {
        id: 'settings-1',
        guildId: 'guild-1',
        enabled: true,
        spamEnabled: true,
        spamThreshold: 5,
        spamTimeWindow: 10,
        capsEnabled: true,
        capsThreshold: 75,
        linksEnabled: true,
        allowedDomains: ['youtube.com', 'discord.com'],
        linkExemptChannels: [],
        invitesEnabled: true,
        wordsEnabled: true,
        bannedWords: ['test'],
        exemptRoles: [],
        exemptChannels: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
        service = new AutoModService()
        _resetSpamWindows()
        _resetSettingsCache()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('getSettings - in-memory cache', () => {
        test('returns settings from database on first call', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.getSettings('guild-1')

            expect(result).toEqual(mockSettings)
            expect(mockFindUnique).toHaveBeenCalledTimes(1)
            expect(mockFindUnique).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
            })
        })

        test('returns cached settings on second call within TTL', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const first = await service.getSettings('guild-1')
            const second = await service.getSettings('guild-1')

            expect(first).toEqual(mockSettings)
            expect(second).toEqual(mockSettings)
            // Database should only be called once due to caching
            expect(mockFindUnique).toHaveBeenCalledTimes(1)
        })

        test('returns null when settings do not exist', async () => {
            mockFindUnique.mockResolvedValue(null)

            const result = await service.getSettings('guild-999')

            expect(result).toBeNull()
            expect(mockFindUnique).toHaveBeenCalledTimes(1)
        })

        test('refetches from database after cache TTL expires', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const first = await service.getSettings('guild-1')
            expect(first).toEqual(mockSettings)
            expect(mockFindUnique).toHaveBeenCalledTimes(1)

            // Advance time past TTL (300 seconds = 300000ms)
            jest.advanceTimersByTime(301000)

            const second = await service.getSettings('guild-1')
            expect(second).toEqual(mockSettings)
            expect(mockFindUnique).toHaveBeenCalledTimes(2)
        })

        test('does not cache null results', async () => {
            mockFindUnique.mockResolvedValue(null)

            const first = await service.getSettings('guild-999')
            expect(first).toBeNull()
            expect(mockFindUnique).toHaveBeenCalledTimes(1)

            // Advance time but not past TTL
            jest.advanceTimersByTime(100000)

            const second = await service.getSettings('guild-999')
            expect(second).toBeNull()
            // Should refetch since null wasn't cached
            expect(mockFindUnique).toHaveBeenCalledTimes(2)
        })
    })

    describe('createSettings', () => {
        test('creates settings and invalidates cache', async () => {
            const created = {
                ...mockSettings,
                id: 'new-settings-1',
            }
            mockCreate.mockResolvedValue(created)
            mockFindUnique.mockResolvedValue(created)

            // Prime cache
            await service.getSettings('guild-2')
            expect(mockFindUnique).toHaveBeenCalledTimes(1)

            // Create settings (which should invalidate cache)
            const result = await service.createSettings('guild-2')

            expect(result).toEqual(created)
            expect(mockCreate).toHaveBeenCalledWith({
                data: { guildId: 'guild-2' },
            })

            // Getting settings again should refetch
            mockFindUnique.mockResolvedValue(created)
            await service.getSettings('guild-2')
            expect(mockFindUnique).toHaveBeenCalledTimes(2)
        })
    })

    describe('updateSettings', () => {
        test('upserts settings and invalidates cache', async () => {
            const updated = {
                ...mockSettings,
                capsEnabled: false,
            }
            mockUpsert.mockResolvedValue(updated)

            // Prime cache
            mockFindUnique.mockResolvedValue(mockSettings)
            await service.getSettings('guild-1')
            expect(mockFindUnique).toHaveBeenCalledTimes(1)

            // Update settings (should invalidate)
            const result = await service.updateSettings('guild-1', {
                capsEnabled: false,
            })

            expect(result).toEqual(updated)
            expect(mockUpsert).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
                create: { guildId: 'guild-1', capsEnabled: false },
                update: { capsEnabled: false },
            })

            // Getting settings again should refetch
            mockFindUnique.mockResolvedValue(updated)
            await service.getSettings('guild-1')
            expect(mockFindUnique).toHaveBeenCalledTimes(2)
        })
    })

    describe('spam tracking', () => {
        test('trackMessageAndCheckSpam returns false when spam is not enabled', async () => {
            const disabledSettings = { ...mockSettings, spamEnabled: false }
            mockFindUnique.mockResolvedValue(disabledSettings)

            const result = await service.trackMessageAndCheckSpam(
                'guild-1',
                'user-1',
            )

            expect(result).toBe(false)
        })

        test('trackMessageAndCheckSpam returns false below threshold', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            // Track 3 messages (threshold is 5)
            for (let i = 0; i < 3; i++) {
                const result = await service.trackMessageAndCheckSpam(
                    'guild-1',
                    'user-1',
                )
                expect(result).toBe(false)
            }
        })

        test('trackMessageAndCheckSpam returns true at threshold', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            // Track 5 messages (threshold is 5)
            for (let i = 0; i < 4; i++) {
                await service.trackMessageAndCheckSpam('guild-1', 'user-1')
            }

            const result = await service.trackMessageAndCheckSpam(
                'guild-1',
                'user-1',
            )
            expect(result).toBe(true)
        })

        test('checkSpam returns false when spam is not enabled', async () => {
            const disabledSettings = { ...mockSettings, spamEnabled: false }
            mockFindUnique.mockResolvedValue(disabledSettings)

            const result = await service.checkSpam('guild-1', 'user-1', [
                Date.now(),
            ])

            expect(result).toBe(false)
        })

        test('checkSpam returns false for timestamps outside window', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const now = Date.now()
            const oldTimestamp = now - 20 * 1000 // 20 seconds ago (window is 10s)

            const result = await service.checkSpam('guild-1', 'user-1', [
                oldTimestamp,
            ])

            expect(result).toBe(false)
        })

        test('checkSpam returns true for recent messages at threshold', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const now = Date.now()
            const timestamps = Array(5)
                .fill(0)
                .map(() => now - 1000) // All within window

            const result = await service.checkSpam(
                'guild-1',
                'user-1',
                timestamps,
            )

            expect(result).toBe(true)
        })
    })

    describe('checkCaps', () => {
        test('returns false when caps check is disabled', async () => {
            const disabledSettings = { ...mockSettings, capsEnabled: false }
            mockFindUnique.mockResolvedValue(disabledSettings)

            const result = await service.checkCaps('guild-1', 'HELLO')

            expect(result).toBe(false)
        })

        test('returns false for content under 10 characters', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkCaps('guild-1', 'HELLO')

            expect(result).toBe(false)
        })

        test('returns false when caps percentage is below threshold', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkCaps(
                'guild-1',
                'hello world this is a test',
            )

            expect(result).toBe(false)
        })

        test('returns true when caps percentage exceeds threshold', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkCaps(
                'guild-1',
                'HELLO WORLD THIS IS A TEST',
            )

            expect(result).toBe(true)
        })
    })

    describe('checkLinks', () => {
        test('returns false when link check is disabled', async () => {
            const disabledSettings = { ...mockSettings, linksEnabled: false }
            mockFindUnique.mockResolvedValue(disabledSettings)

            const result = await service.checkLinks(
                'guild-1',
                'https://example.com',
            )

            expect(result).toBe(false)
        })

        test('returns false for exempt channel', async () => {
            const exemptSettings = {
                ...mockSettings,
                linkExemptChannels: ['channel-1'],
            }
            mockFindUnique.mockResolvedValue(exemptSettings)

            const result = await service.checkLinks(
                'guild-1',
                'https://example.com',
                'channel-1',
            )

            expect(result).toBe(false)
        })

        test('returns false for allowed domains', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkLinks(
                'guild-1',
                'Check this out: https://youtube.com/watch?v=123',
            )

            expect(result).toBe(false)
        })

        test('returns true for disallowed domains', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkLinks(
                'guild-1',
                'Visit https://malicious.com for fun',
            )

            expect(result).toBe(true)
        })

        test('returns false when no URLs present', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkLinks('guild-1', 'just some text')

            expect(result).toBe(false)
        })
    })

    describe('checkInvites', () => {
        test('returns false when invite check is disabled', async () => {
            const disabledSettings = { ...mockSettings, invitesEnabled: false }
            mockFindUnique.mockResolvedValue(disabledSettings)

            const result = await service.checkInvites(
                'guild-1',
                'discord.gg/test123',
            )

            expect(result).toBe(false)
        })

        test('returns true for discord.gg links', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkInvites(
                'guild-1',
                'Join us at discord.gg/mycommunity',
            )

            expect(result).toBe(true)
        })

        test('returns true for discord.com/invite links', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkInvites(
                'guild-1',
                'Join us at discord.com/invite/mycommunity',
            )

            expect(result).toBe(true)
        })

        test('returns false when no invites present', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkInvites('guild-1', 'just text')

            expect(result).toBe(false)
        })
    })

    describe('checkWords', () => {
        test('returns false when word check is disabled', async () => {
            const disabledSettings = { ...mockSettings, wordsEnabled: false }
            mockFindUnique.mockResolvedValue(disabledSettings)

            const result = await service.checkWords('guild-1', 'test')

            expect(result).toBe(false)
        })

        test('returns false when no banned words configured', async () => {
            const noWordsSettings = { ...mockSettings, bannedWords: [] }
            mockFindUnique.mockResolvedValue(noWordsSettings)

            const result = await service.checkWords('guild-1', 'test')

            expect(result).toBe(false)
        })

        test('returns false when banned words not present', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkWords('guild-1', 'hello world')

            expect(result).toBe(false)
        })

        test('returns true when banned word is present', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkWords('guild-1', 'this is a test')

            expect(result).toBe(true)
        })

        test('is case insensitive', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)

            const result = await service.checkWords('guild-1', 'THIS IS A TEST')

            expect(result).toBe(true)
        })
    })

    describe('isExempt', () => {
        test('returns true for exempt channel', () => {
            const result = service.isExempt(
                { ...mockSettings, exemptChannels: ['channel-1'] },
                'channel-1',
            )

            expect(result).toBe(true)
        })

        test('returns true for exempt role', () => {
            const result = service.isExempt(
                { ...mockSettings, exemptRoles: ['role-1'] },
                undefined,
                ['role-1'],
            )

            expect(result).toBe(true)
        })

        test('returns false when not exempt', () => {
            const result = service.isExempt(mockSettings, 'channel-2', [
                'role-2',
            ])

            expect(result).toBe(false)
        })
    })

    describe('applyTemplate', () => {
        test('merges template settings with existing settings', async () => {
            mockFindUnique.mockResolvedValue(mockSettings)
            mockUpsert.mockResolvedValue({
                ...mockSettings,
                spamThreshold: 6,
            })

            const result = await service.applyTemplate('guild-1', 'balanced')

            expect(result.template.id).toBe('balanced')
            expect(result.settings).toBeDefined()
            expect(mockUpsert).toHaveBeenCalled()
        })

        test('throws on unknown template', async () => {
            await expect(
                service.applyTemplate('guild-1', 'unknown'),
            ).rejects.toThrow('Auto-mod template not found: unknown')
        })
    })
})
