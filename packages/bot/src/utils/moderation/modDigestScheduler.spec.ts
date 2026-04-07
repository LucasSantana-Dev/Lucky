import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const moderationServiceMock = {
    getStats: jest.fn(),
    getRecentCases: jest.fn(),
}

const modDigestConfigServiceMock = {
    listEnabledGuildIds: jest.fn(),
    get: jest.fn(),
    markSent: jest.fn(),
}

jest.mock('@lucky/shared/services', () => ({
    moderationService: moderationServiceMock,
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('./modDigestConfig', () => ({
    modDigestConfigService: modDigestConfigServiceMock,
}))

import { ModDigestSchedulerService } from './modDigestScheduler'

function createTextChannelMock() {
    return {
        type: 0, // ChannelType.GuildText
        send: jest.fn().mockResolvedValue(undefined),
    }
}

function createClientMock(channels: Map<string, any> = new Map()) {
    const guildId = 'guild-1'
    const channelId = 'channel-1'
    if (!channels.has(channelId)) {
        channels.set(channelId, createTextChannelMock())
    }

    return {
        guilds: {
            cache: {
                get: jest.fn((id: string) =>
                    id === guildId
                        ? {
                              id: guildId,
                              channels: {
                                  fetch: jest.fn(async (cid: string) =>
                                      channels.get(cid) ?? null,
                                  ),
                              },
                          }
                        : null,
                ),
            },
        },
    }
}

describe('ModDigestSchedulerService.isDue', () => {
    it('returns true when lastSentAt is null', () => {
        const service = new ModDigestSchedulerService({
            periodDays: 7,
            clock: () => 0,
        })
        expect(
            service.isDue({
                guildId: 'g',
                channelId: 'c',
                enabled: true,
                lastSentAt: null,
                createdAt: 0,
            }),
        ).toBe(true)
    })

    it('returns true when more than periodDays have passed', () => {
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
        const service = new ModDigestSchedulerService({
            periodDays: 7,
            clock: () => sevenDaysMs + 1000,
        })
        expect(
            service.isDue({
                guildId: 'g',
                channelId: 'c',
                enabled: true,
                lastSentAt: 0,
                createdAt: 0,
            }),
        ).toBe(true)
    })

    it('returns false when less than periodDays have passed', () => {
        const service = new ModDigestSchedulerService({
            periodDays: 7,
            clock: () => 60_000,
        })
        expect(
            service.isDue({
                guildId: 'g',
                channelId: 'c',
                enabled: true,
                lastSentAt: 0,
                createdAt: 0,
            }),
        ).toBe(false)
    })
})

describe('ModDigestSchedulerService.tick', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        moderationServiceMock.getStats.mockResolvedValue({
            totalCases: 5,
            activeCases: 1,
        })
        moderationServiceMock.getRecentCases.mockResolvedValue([
            {
                type: 'warn',
                moderatorName: 'Alice',
                createdAt: new Date(),
            },
        ])
    })

    it('returns 0 when no enabled guilds exist', async () => {
        modDigestConfigServiceMock.listEnabledGuildIds.mockResolvedValue([])
        const service = new ModDigestSchedulerService({
            periodDays: 7,
            clock: () => 0,
        })
        service.start(createClientMock() as any)
        try {
            await expect(service.tick()).resolves.toBe(0)
        } finally {
            service.stop()
        }
    })

    it('sends a digest and marks sent for due guilds', async () => {
        const channels = new Map<string, any>()
        const client = createClientMock(channels)
        modDigestConfigServiceMock.listEnabledGuildIds.mockResolvedValue([
            'guild-1',
        ])
        modDigestConfigServiceMock.get.mockResolvedValue({
            guildId: 'guild-1',
            channelId: 'channel-1',
            enabled: true,
            lastSentAt: null,
            createdAt: 0,
        })
        modDigestConfigServiceMock.markSent.mockResolvedValue(undefined)

        const service = new ModDigestSchedulerService({
            periodDays: 7,
            clock: () => 1000,
        })
        service.start(client as any)
        try {
            const sent = await service.tick()
            expect(sent).toBe(1)
            expect(channels.get('channel-1').send).toHaveBeenCalledTimes(1)
            expect(modDigestConfigServiceMock.markSent).toHaveBeenCalledWith(
                'guild-1',
                1000,
            )
        } finally {
            service.stop()
        }
    })

    it('skips disabled guilds', async () => {
        const channels = new Map<string, any>()
        const client = createClientMock(channels)
        modDigestConfigServiceMock.listEnabledGuildIds.mockResolvedValue([
            'guild-1',
        ])
        modDigestConfigServiceMock.get.mockResolvedValue({
            guildId: 'guild-1',
            channelId: 'channel-1',
            enabled: false,
            lastSentAt: null,
            createdAt: 0,
        })

        const service = new ModDigestSchedulerService({
            periodDays: 7,
            clock: () => 0,
        })
        service.start(client as any)
        try {
            const sent = await service.tick()
            expect(sent).toBe(0)
            expect(channels.get('channel-1').send).not.toHaveBeenCalled()
        } finally {
            service.stop()
        }
    })

    it('skips guilds that are not yet due', async () => {
        const channels = new Map<string, any>()
        const client = createClientMock(channels)
        modDigestConfigServiceMock.listEnabledGuildIds.mockResolvedValue([
            'guild-1',
        ])
        modDigestConfigServiceMock.get.mockResolvedValue({
            guildId: 'guild-1',
            channelId: 'channel-1',
            enabled: true,
            lastSentAt: 100,
            createdAt: 0,
        })

        const service = new ModDigestSchedulerService({
            periodDays: 7,
            clock: () => 200,
        })
        service.start(client as any)
        try {
            const sent = await service.tick()
            expect(sent).toBe(0)
        } finally {
            service.stop()
        }
    })

    it('returns 0 when started without a client', async () => {
        const service = new ModDigestSchedulerService()
        await expect(service.tick()).resolves.toBe(0)
    })
})

describe('ModDigestSchedulerService.sendDigestForGuild', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        moderationServiceMock.getStats.mockResolvedValue({
            totalCases: 5,
            activeCases: 1,
        })
        moderationServiceMock.getRecentCases.mockResolvedValue([])
    })

    it('returns false when client is not started', async () => {
        const service = new ModDigestSchedulerService()
        const result = await service.sendDigestForGuild('g', 'c')
        expect(result).toBe(false)
    })

    it('returns false when guild is not in cache', async () => {
        const service = new ModDigestSchedulerService()
        service.start({
            guilds: { cache: { get: () => null } },
        } as any)
        try {
            const result = await service.sendDigestForGuild('missing', 'c')
            expect(result).toBe(false)
        } finally {
            service.stop()
        }
    })

    it('returns false when channel fetch returns null', async () => {
        const service = new ModDigestSchedulerService()
        service.start({
            guilds: {
                cache: {
                    get: () => ({
                        channels: {
                            fetch: jest.fn().mockResolvedValue(null),
                        },
                    }),
                },
            },
        } as any)
        try {
            const result = await service.sendDigestForGuild('g', 'c')
            expect(result).toBe(false)
        } finally {
            service.stop()
        }
    })

    it('returns false and swallows errors when send fails', async () => {
        const channels = new Map<string, any>()
        channels.set('channel-1', {
            type: 0,
            send: jest.fn().mockRejectedValue(new Error('discord boom')),
        })
        const service = new ModDigestSchedulerService()
        service.start(createClientMock(channels) as any)
        try {
            const result = await service.sendDigestForGuild('guild-1', 'channel-1')
            expect(result).toBe(false)
        } finally {
            service.stop()
        }
    })
})
