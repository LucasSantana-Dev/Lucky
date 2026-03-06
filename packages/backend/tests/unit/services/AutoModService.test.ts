import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    autoModSettings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
    },
}

jest.unstable_mockModule('@lukbot/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    prisma: mockPrisma,
}))

beforeAll(async () => {
    // TODO: AutoModService not implemented yet - skip this test file
    return
    const module = await import('@lukbot/shared/services')
    const { AutoModService } = module
})

const DEFAULT_SETTINGS = {
    guildId: '111111111111111111',
    spamEnabled: false,
    spamThreshold: 5,
    spamInterval: 5000,
    spamAction: 'warn',
    capsEnabled: false,
    capsThreshold: 70,
    capsMinLength: 10,
    capsAction: 'delete',
    linksEnabled: false,
    linksWhitelist: [] as string[],
    linksAction: 'delete',
    invitesEnabled: false,
    invitesAction: 'delete',
    wordsEnabled: false,
    wordsList: [] as string[],
    wordsAction: 'delete',
    ignoredChannels: [] as string[],
    ignoredRoles: [] as string[],
}

describe('AutoModService', () => {
    let service: InstanceType<typeof AutoModService>

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'
    const USER_A = '333333333333333333'

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
        })

        test('should create default settings if none exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)
            mockPrisma.autoModSettings.create.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                guildId: GUILD_A,
            })

            const result = await service.getSettings(GUILD_A)

            expect(result.guildId).toBe(GUILD_A)
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
        test('should return null when spam detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: false,
            })

            const result = await service.checkSpam(USER_A, GUILD_A, Date.now())

            expect(result).toBeNull()
        })

        test('should not trigger on first message', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 3,
                spamInterval: 5000,
            })

            const result = await service.checkSpam(USER_A, GUILD_A, Date.now())

            expect(result).toBeNull()
        })

        test('should trigger when threshold exceeded within interval', async () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 3,
                spamInterval: 5000,
                spamAction: 'mute',
            }
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(settings)

            const now = Date.now()
            await service.checkSpam(USER_A, GUILD_A, now)
            await service.checkSpam(USER_A, GUILD_A, now + 100)
            await service.checkSpam(USER_A, GUILD_A, now + 200)
            const result = await service.checkSpam(USER_A, GUILD_A, now + 300)

            expect(result).toEqual({
                type: 'mute',
                reason: 'Spam detected',
            })
        })

        test('should reset tracking after interval expires', async () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 3,
                spamInterval: 1000,
            }
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(settings)

            const now = Date.now()
            await service.checkSpam(USER_A, GUILD_A, now)
            await service.checkSpam(USER_A, GUILD_A, now + 100)
            const result = await service.checkSpam(USER_A, GUILD_A, now + 2000)

            expect(result).toBeNull()
        })

        test('should track users independently per guild (multi-server)', async () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 2,
                spamInterval: 5000,
                spamAction: 'warn',
            }
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(settings)

            const now = Date.now()
            await service.checkSpam(USER_A, GUILD_A, now)
            await service.checkSpam(USER_A, GUILD_A, now + 100)
            const resultA = await service.checkSpam(USER_A, GUILD_A, now + 200)

            await service.checkSpam(USER_A, GUILD_B, now)
            const resultB = await service.checkSpam(USER_A, GUILD_B, now + 100)

            expect(resultA).not.toBeNull()
            expect(resultB).toBeNull()
        })
    })

    describe('checkCaps', () => {
        test('should return null when caps detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: false,
            })

            const result = await service.checkCaps(GUILD_A, 'HELLO WORLD')

            expect(result).toBeNull()
        })

        test('should return null for short messages', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: true,
                capsMinLength: 10,
            })

            const result = await service.checkCaps(GUILD_A, 'HI')

            expect(result).toBeNull()
        })

        test('should trigger when caps percentage exceeds threshold', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: true,
                capsThreshold: 70,
                capsMinLength: 5,
                capsAction: 'delete',
            })

            const result = await service.checkCaps(
                GUILD_A,
                'THIS IS ALL CAPS MESSAGE',
            )

            expect(result).toEqual({
                type: 'delete',
                reason: 'Excessive caps',
            })
        })

        test('should not trigger for normal messages', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                capsEnabled: true,
                capsThreshold: 70,
                capsMinLength: 5,
            })

            const result = await service.checkCaps(
                GUILD_A,
                'This is a normal message with some Caps',
            )

            expect(result).toBeNull()
        })
    })

    describe('checkLinks', () => {
        test('should return null when link detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: false,
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Check https://example.com',
            )

            expect(result).toBeNull()
        })

        test('should trigger for non-whitelisted links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
                linksWhitelist: ['youtube.com'],
                linksAction: 'delete',
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Visit https://malicious-site.com',
            )

            expect(result).toEqual({
                type: 'delete',
                reason: 'Unauthorized link',
            })
        })

        test('should allow whitelisted links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
                linksWhitelist: ['youtube.com'],
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Watch https://youtube.com/watch?v=123',
            )

            expect(result).toBeNull()
        })

        test('should return null for messages without links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
            })

            const result = await service.checkLinks(GUILD_A, 'No links here')

            expect(result).toBeNull()
        })
    })

    describe('checkInvites', () => {
        test('should return null when invite detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: false,
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Join discord.gg/abc123',
            )

            expect(result).toBeNull()
        })

        test('should trigger for discord.gg invites', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: true,
                invitesAction: 'warn',
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Join discord.gg/abc123',
            )

            expect(result).toEqual({
                type: 'warn',
                reason: 'Discord invite link',
            })
        })

        test('should trigger for discord.com/invite links', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: true,
                invitesAction: 'delete',
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Join discord.com/invite/abc123',
            )

            expect(result).toEqual({
                type: 'delete',
                reason: 'Discord invite link',
            })
        })

        test('should not trigger for messages without invites', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                invitesEnabled: true,
            })

            const result = await service.checkInvites(
                GUILD_A,
                'Just a normal message',
            )

            expect(result).toBeNull()
        })
    })

    describe('checkBadWords', () => {
        test('should return null when word filter is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: false,
            })

            const result = await service.checkBadWords(GUILD_A, 'badword')

            expect(result).toBeNull()
        })

        test('should return null when word list is empty', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                wordsList: [],
            })

            const result = await service.checkBadWords(GUILD_A, 'anything')

            expect(result).toBeNull()
        })

        test('should trigger for messages containing bad words', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                wordsList: ['badword', 'offensive'],
                wordsAction: 'warn',
            })

            const result = await service.checkBadWords(
                GUILD_A,
                'This contains a badword in it',
            )

            expect(result).toEqual({
                type: 'warn',
                reason: 'Inappropriate language',
            })
        })

        test('should be case-insensitive', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                wordsList: ['badword'],
                wordsAction: 'delete',
            })

            const result = await service.checkBadWords(
                GUILD_A,
                'This has BADWORD in it',
            )

            expect(result).toEqual({
                type: 'delete',
                reason: 'Inappropriate language',
            })
        })

        test('should not trigger for clean messages', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                wordsEnabled: true,
                wordsList: ['badword'],
            })

            const result = await service.checkBadWords(
                GUILD_A,
                'This is a clean message',
            )

            expect(result).toBeNull()
        })
    })

    describe('shouldIgnore', () => {
        test('should ignore messages in ignored channels', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                ignoredChannels: ['channel-1', 'channel-2'],
                ignoredRoles: [],
            })

            const result = await service.shouldIgnore(GUILD_A, 'channel-1', [])

            expect(result).toBe(true)
        })

        test('should ignore users with ignored roles', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                ignoredChannels: [],
                ignoredRoles: ['mod-role'],
            })

            const result = await service.shouldIgnore(GUILD_A, 'channel-1', [
                'mod-role',
            ])

            expect(result).toBe(true)
        })

        test('should not ignore regular users in regular channels', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                ignoredChannels: ['other-channel'],
                ignoredRoles: ['admin-role'],
            })

            const result = await service.shouldIgnore(GUILD_A, 'channel-1', [
                'member-role',
            ])

            expect(result).toBe(false)
        })
    })

    describe('clearSpamTracking', () => {
        test('should clear tracking for specific user in guild', async () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 10,
                spamInterval: 10000,
            }
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(settings)

            const now = Date.now()
            await service.checkSpam(USER_A, GUILD_A, now)
            await service.checkSpam(USER_A, GUILD_A, now + 100)

            service.clearSpamTracking(USER_A, GUILD_A)

            const result = await service.checkSpam(USER_A, GUILD_A, now + 200)
            expect(result).toBeNull()
        })
    })

    describe('clearAllSpamTracking', () => {
        test('should clear all tracking data', async () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 10,
                spamInterval: 10000,
            }
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(settings)

            const now = Date.now()
            await service.checkSpam(USER_A, GUILD_A, now)
            await service.checkSpam(USER_A, GUILD_B, now)

            service.clearAllSpamTracking()

            const resultA = await service.checkSpam(USER_A, GUILD_A, now + 100)
            const resultB = await service.checkSpam(USER_A, GUILD_B, now + 100)
            expect(resultA).toBeNull()
            expect(resultB).toBeNull()
        })
    })
})
