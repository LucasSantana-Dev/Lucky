import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    autoModSettings: {
        findUnique: jest.fn<any>(),
        create: jest.fn<any>(),
        upsert: jest.fn<any>(),
    },
}

jest.mock('@lucky/shared/utils/database/prismaClient', () => {
    return { getPrismaClient: () => mockPrisma }
})

const mockRedis = {
    isHealthy: jest.fn<() => boolean>(() => false),
    get: jest.fn<any>().mockResolvedValue(null),
    setex: jest.fn<any>().mockResolvedValue(true),
    del: jest.fn<any>().mockResolvedValue(true),
    lpush: jest.fn<any>().mockResolvedValue(1),
    ltrim: jest.fn<any>().mockResolvedValue(true),
    expire: jest.fn<any>().mockResolvedValue(true),
    lrange: jest.fn<any>().mockResolvedValue([]),
}

jest.mock('@lucky/shared/services/redis', () => ({
    redisClient: mockRedis,
}))

jest.mock('@lucky/shared/utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

import { AutoModService } from '@lucky/shared/services/AutoModService'

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
    linkExemptChannels: [] as string[],
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
        mockRedis.isHealthy.mockReturnValue(false)
        mockRedis.get.mockResolvedValue(null)
        mockRedis.setex.mockResolvedValue(true)
        mockRedis.del.mockResolvedValue(true)
        mockRedis.lpush.mockResolvedValue(1)
        mockRedis.ltrim.mockResolvedValue(true)
        mockRedis.expire.mockResolvedValue(true)
        mockRedis.lrange.mockResolvedValue([])
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

    describe('trackMessageAndCheckSpam', () => {
        test('should return false when spam detection is disabled', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: false,
            })

            const result = await service.trackMessageAndCheckSpam(
                GUILD_A,
                USER_A,
            )

            expect(result).toBe(false)
        })

        test('should return false when settings do not exist', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue(null)

            const result = await service.trackMessageAndCheckSpam(
                GUILD_A,
                USER_A,
            )

            expect(result).toBe(false)
        })

        test('should return false when Redis is not healthy', async () => {
            mockRedis.isHealthy.mockReturnValue(false)
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 3,
                spamTimeWindow: 5,
            })

            const result = await service.trackMessageAndCheckSpam(
                GUILD_A,
                USER_A,
            )

            expect(result).toBe(false)
        })

        test('should return true when threshold exceeded in Redis', async () => {
            mockRedis.isHealthy.mockReturnValue(true)
            mockRedis.lpush.mockResolvedValue(3)
            mockRedis.ltrim.mockResolvedValue(true)
            mockRedis.expire.mockResolvedValue(true)
            const now = Date.now()
            mockRedis.lrange.mockResolvedValue([
                String(now - 100),
                String(now - 200),
                String(now - 300),
            ])
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 3,
                spamTimeWindow: 5,
            })

            const result = await service.trackMessageAndCheckSpam(
                GUILD_A,
                USER_A,
            )

            expect(result).toBe(true)
            expect(mockRedis.lpush).toHaveBeenCalledWith(
                `spam:${GUILD_A}:${USER_A}`,
                expect.any(String),
            )
        })

        test('should return false when below threshold in Redis', async () => {
            mockRedis.isHealthy.mockReturnValue(true)
            mockRedis.lpush.mockResolvedValue(2)
            mockRedis.ltrim.mockResolvedValue(true)
            mockRedis.expire.mockResolvedValue(true)
            const now = Date.now()
            mockRedis.lrange.mockResolvedValue([
                String(now - 100),
                String(now - 200),
            ])
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                spamEnabled: true,
                spamThreshold: 5,
                spamTimeWindow: 5,
            })

            const result = await service.trackMessageAndCheckSpam(
                GUILD_A,
                USER_A,
            )

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

        test('should return false for vercel.app links when in allowedDomains', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
                allowedDomains: ['vercel.app'],
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Check my project at https://my-project.vercel.app',
            )

            expect(result).toBe(false)
        })

        test('should return false when channel is in linkExemptChannels', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
                allowedDomains: ['youtube.com'],
                linkExemptChannels: [CHANNEL_1],
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Visit https://my-project.vercel.app',
                CHANNEL_1,
            )

            expect(result).toBe(false)
        })

        test('should still block links in non-exempt channels', async () => {
            mockPrisma.autoModSettings.findUnique.mockResolvedValue({
                ...DEFAULT_SETTINGS,
                linksEnabled: true,
                allowedDomains: ['youtube.com'],
                linkExemptChannels: [CHANNEL_1],
            })

            const result = await service.checkLinks(
                GUILD_A,
                'Visit https://malicious-site.com',
                '999999999999999999',
            )

            expect(result).toBe(true)
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
