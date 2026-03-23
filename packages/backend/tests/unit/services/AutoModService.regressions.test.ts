import { beforeEach, describe, expect, jest, test } from '@jest/globals'

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

jest.mock('@lucky/shared/services/redis', () => ({
    redisClient: {
        isHealthy: jest.fn(() => false),
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
    },
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
    invitesEnabled: false,
    wordsEnabled: false,
    bannedWords: [] as string[],
    exemptChannels: [] as string[],
    exemptRoles: [] as string[],
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('AutoModService regressions', () => {
    let service: InstanceType<typeof AutoModService>

    beforeEach(() => {
        jest.clearAllMocks()
        service = new AutoModService()
    })

    test('checkLinks returns false when allowedDomains is empty', async () => {
        mockPrisma.autoModSettings.findUnique.mockResolvedValue({
            ...DEFAULT_SETTINGS,
            linksEnabled: true,
            allowedDomains: [],
        })

        const result = await service.checkLinks(
            DEFAULT_SETTINGS.guildId,
            'https://tenor.com/view/funny-gif',
        )

        expect(result).toBe(false)
    })

    test('checkLinks allows subdomains of allowed host', async () => {
        mockPrisma.autoModSettings.findUnique.mockResolvedValue({
            ...DEFAULT_SETTINGS,
            linksEnabled: true,
            allowedDomains: ['tenor.com'],
        })

        const result = await service.checkLinks(
            DEFAULT_SETTINGS.guildId,
            'https://media.tenor.com/some-gif',
        )

        expect(result).toBe(false)
    })

    test('checkWords does not match partial substrings like laughter', async () => {
        mockPrisma.autoModSettings.findUnique.mockResolvedValue({
            ...DEFAULT_SETTINGS,
            wordsEnabled: true,
            bannedWords: ['kkk'],
        })

        const result = await service.checkWords(
            DEFAULT_SETTINGS.guildId,
            'kkkkkkkkkkkkk',
        )

        expect(result).toBe(false)
    })

    test('checkWords still matches standalone banned token', async () => {
        mockPrisma.autoModSettings.findUnique.mockResolvedValue({
            ...DEFAULT_SETTINGS,
            wordsEnabled: true,
            bannedWords: ['kkk'],
        })

        const result = await service.checkWords(
            DEFAULT_SETTINGS.guildId,
            'isso foi kkk ontem',
        )

        expect(result).toBe(true)
    })
})
