import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    autoModSettings: {
        findUnique: jest.fn<any>(),
        create: jest.fn<any>(),
        upsert: jest.fn<any>(),
    },
}

jest.mock('@nexus/shared/utils/database/prismaClient', () => {
    return { getPrismaClient: () => mockPrisma }
})

jest.mock('@nexus/shared/services/redis', () => ({
    redisClient: {
        isHealthy: jest.fn(() => false),
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
    },
}))

jest.mock('@nexus/shared/utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

import { AutoModService } from '@nexus/shared/services/AutoModService'

const DEFAULT_SETTINGS = {
    id: '1',
    guildId: '111111111111111111',
    enabled: true,
    spamEnabled: false,
    spamThreshold: 5,
    spamTimeWindow: 5,
    capsEnabled: false,
    capsThreshold: 70,
    linksEnabled: false,
    allowedDomains: [] as string[],
    invitesEnabled: false,
    wordsEnabled: false,
    bannedWords: [] as string[],
    exemptChannels: [] as string[],
    exemptRoles: [] as string[],
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('AutoModService', () => {
    let service: InstanceType<typeof AutoModService>

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'
    const USER_A = '333333333333333333'
    const CHANNEL_1 = '444444444444444444'

    beforeEach(() => {
        jest.clearAllMocks()
        service = new AutoModService()
    })

    describe('getSettings', () => {
        test('should return existing settings', async () => {
            const settings = { ...DEFAULT_SETTINGS, guildId: GUILD_A }
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(settings)

            const result = await service.getSettings(GUILD_A)

            expect(result).toEqual(settings)
            expect(mockPrisma.autoModSettings.findUnique).toHaveBeenCalledWith({
                where: { guildId: GUILD_A },
            })
        })

        test('should return null if settings do not exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)

            const result = await service.getSettings(GUILD_A)

            expect(result).toBeNull()
        })
    })

    describe('createSettings', () => {
        test('should create default settings', async () => {
            const created = { ...DEFAULT_SETTINGS, guildId: GUILD_A }
            mockPrisma.autoModSettings.create.mockResolvedValue(created)

            const result = await service.createSettings(GUILD_A)

            expect(result.guildId).toBe(GUILD_A)
            expect(result.enabled).toBe(true)
            expect(result.spamEnabled).toBe(false)
            expect(result.spamThreshold).toBe(5)
            expect(mockPrisma.autoModSettings.create).toHaveBeenCalledWith({
                data: { guildId: GUILD_A },
            })
        })
    })

    describe('updateSettings', () => {
        test('should upsert settings', async () => {
            const updated = {
                ...DEFAULT_SETTINGS,
                guildId: GUILD_A,
                spamEnabled: true,
            }
            mockPrisma.autoModSettings.upsert.mockResolvedValue(updated)

            const result = await service.updateSettings(GUILD_A, {
                spamEnabled: true,
            })

            expect(result.spamEnabled).toBe(true)
            expect(mockPrisma.autoModSettings.upsert).toHaveBeenCalledWith({
                where: { guildId: GUILD_A },
                create: { guildId: GUILD_A, spamEnabled: true },
                update: { spamEnabled: true },
            })
        })
    })

    describe('checkSpam', () => {
        test('should return false when spam detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: false,
            })

            const result = await service.checkSpam(GUILD_A, USER_A, [
                Date.now(),
            ])

            expect(result).toBe(false)
        })

        test('should return false when settings do not exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)

            const result = await service.checkSpam(GUILD_A, USER_A, [
                Date.now(),
            ])

            expect(result).toBe(false)
        })

        test('should return false when below threshold', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 5,
                spamTimeWindow: 5,
            })

            const now = Date.now()
            const timestamps = [now - 1000, now - 500]

            const result = await service.checkSpam(GUILD_A, USER_A, timestamps)

            expect(result).toBe(false)
        })

        test('should return true when threshold exceeded within interval', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 3,
                spamTimeWindow: 5,
            })

            const now = Date.now()
            const timestamps = [now - 1000, now - 500, now - 100]

            const result = await service.checkSpam(GUILD_A, USER_A, timestamps)

            expect(result).toBe(true)
        })

        test('should ignore old timestamps outside interval', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 3,
                spamTimeWindow: 2,
            })

            const now = Date.now()
            const timestamps = [now - 10000, now - 8000, now - 500]

            const result = await service.checkSpam(GUILD_A, USER_A, timestamps)

            expect(result).toBe(false)
        })
    })

    describe('checkCaps', () => {
        test('should return false when caps detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: false,
            })

            const result = await service.checkCaps(GUILD_A, 'HELLO WORLD')

            expect(result).toBe(false)
        })

        test('should return false when settings do not exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)

            const result = await service.checkCaps(GUILD_A, 'HELLO WORLD')

            expect(result).toBe(false)
        })

        test('should return true when caps percentage exceeds threshold', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: true,
                capsThreshold: 70,
            })

            const result = await service.checkCaps(
                GUILD_A,
                'THIS IS ALL CAPS MESSAGE',
            )

            expect(result).toBe(true)
        })

        test('should return false for normal messages', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: true,
                capsThreshold: 70,
            })

            const result = await service.checkCaps(
                GUILD_A,
                'This is a normal message with some Caps',
            )

            expect(result).toBe(false)
        })

        test('should return false for messages with no letters', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: true,
                capsThreshold: 70,
            })

            const result = await service.checkCaps(GUILD_A, '12345 !@#$%')

            expect(result).toBe(false)
        })
    })

    describe('checkLinks', () => {
        test('should return false when link detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: false,
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Check https://example.com',
            )

            expect(result).toBe(false)
        })

        test('should return false when settings do not exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)

            const result = await service.checkLinks(
                GUILD_A,
                'Check https://example.com',
            )

            expect(result).toBe(false)
        })

        test('should return true for non-whitelisted links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
                allowedDomains: ['youtube.com'],
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Visit https://malicious-site.com',
            )

            expect(result).toBe(true)
        })

        test('should return false for whitelisted links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
                allowedDomains: ['youtube.com'],
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Watch https://youtube.com/watch?v=123',
            )

            expect(result).toBe(false)
        })

        test('should return false for messages without links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
            })

            const result = await service.checkLinks(GUILD_A, 'No links here')

            expect(result).toBe(false)
        })
    })

    describe('checkInvites', () => {
        test('should return false when invite detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: false,
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Join discord.gg/abc123',
            )

            expect(result).toBe(false)
        })

        test('should return false when settings do not exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)

            const result = await service.checkInvites(
                GUILD_A,
                'Join discord.gg/abc123',
            )

            expect(result).toBe(false)
        })

        test('should return true for discord.gg invites', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: true,
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Join discord.gg/abc123',
            )

            expect(result).toBe(true)
        })

        test('should return true for discord.com/invite links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: true,
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Join discord.com/invite/abc123',
            )

            expect(result).toBe(true)
        })

        test('should return false for messages without invites', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: true,
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Just a normal message',
            )

            expect(result).toBe(false)
        })
    })

    describe('checkWords', () => {
        test('should return false when word filter is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: false,
            })

            const result = await service.checkWords(GUILD_A, 'badword')

            expect(result).toBe(false)
        })

        test('should return false when settings do not exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)

            const result = await service.checkWords(GUILD_A, 'badword')

            expect(result).toBe(false)
        })

        test('should return false when word list is empty', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                bannedWords: [],
            })

            const result = await service.checkWords(GUILD_A, 'anything')

            expect(result).toBe(false)
        })

        test('should return true for messages containing bad words', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                bannedWords: ['badword', 'offensive'],
            })

            const result = await service.checkWords(
                GUILD_A,
                'This contains a badword in it',
            )

            expect(result).toBe(true)
        })

        test('should be case-insensitive', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                bannedWords: ['badword'],
            })

            const result = await service.checkWords(
                GUILD_A,
                'This has BADWORD in it',
            )

            expect(result).toBe(true)
        })

        test('should return false for clean messages', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                bannedWords: ['badword'],
            })

            const result = await service.checkWords(
                GUILD_A,
                'This is a clean message',
            )

            expect(result).toBe(false)
        })
    })

    describe('isExempt', () => {
        test('should return true for exempt channels', () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                exemptChannels: ['channel-1', 'channel-2'],
                exemptRoles: [],
            }

            const result = service.isExempt(settings, 'channel-1')

            expect(result).toBe(true)
        })

        test('should return true for users with exempt roles', () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                exemptChannels: [],
                exemptRoles: ['mod-role'],
            }

            const result = service.isExempt(settings, undefined, ['mod-role'])

            expect(result).toBe(true)
        })

        test('should return true if any role is exempt', () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                exemptChannels: [],
                exemptRoles: ['admin-role'],
            }

            const result = service.isExempt(settings, undefined, [
                'member-role',
                'admin-role',
            ])

            expect(result).toBe(true)
        })

        test('should return false for non-exempt channels and roles', () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                exemptChannels: ['other-channel'],
                exemptRoles: ['admin-role'],
            }

            const result = service.isExempt(settings, CHANNEL_1, [
                'member-role',
            ])

            expect(result).toBe(false)
        })

        test('should return false when no channel or roles provided', () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                exemptChannels: ['channel-1'],
                exemptRoles: ['mod-role'],
            }

            const result = service.isExempt(settings)

            expect(result).toBe(false)
        })
    })
})
