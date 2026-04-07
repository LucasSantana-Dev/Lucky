import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        sadd: jest.fn(),
        srem: jest.fn(),
        smembers: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import { redisClient } from '@lucky/shared/services'
import { ModDigestConfigService } from './modDigestConfig'

const redisMock = redisClient as unknown as Record<string, jest.Mock>

function createService() {
    return new ModDigestConfigService()
}

describe('ModDigestConfigService.enable', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        redisMock.get.mockResolvedValue(null)
        redisMock.set.mockResolvedValue(true)
        redisMock.sadd.mockResolvedValue(1)
    })

    it('writes the config and adds the guild to the index', async () => {
        const service = createService()
        const config = await service.enable({
            guildId: 'guild-1',
            channelId: 'channel-1',
        })

        expect(config.guildId).toBe('guild-1')
        expect(config.channelId).toBe('channel-1')
        expect(config.enabled).toBe(true)
        expect(config.lastSentAt).toBeNull()
        expect(redisMock.set).toHaveBeenCalledWith(
            'mod-digest:config:guild-1',
            expect.any(String),
        )
        expect(redisMock.sadd).toHaveBeenCalledWith(
            'mod-digest:enabled-guilds',
            'guild-1',
        )
    })

    it('persists the supplied lastSentAt and createdAt without read-back', async () => {
        const service = createService()
        const config = await service.enable({
            guildId: 'guild-1',
            channelId: 'channel-1',
            lastSentAt: 1234,
            createdAt: 5678,
        })
        expect(config.lastSentAt).toBe(1234)
        expect(config.createdAt).toBe(5678)
        // No read of the existing config — enable now writes atomically.
        expect(redisMock.get).not.toHaveBeenCalled()
    })
})

describe('ModDigestConfigService.disable', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        redisMock.del.mockResolvedValue(true)
        redisMock.srem.mockResolvedValue(1)
    })

    it('removes the config and the index entry', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(
            JSON.stringify({
                guildId: 'guild-1',
                channelId: 'c',
                enabled: true,
                lastSentAt: null,
                createdAt: 1,
            }),
        )

        const result = await service.disable('guild-1')
        expect(result).toBe(true)
        expect(redisMock.del).toHaveBeenCalledWith('mod-digest:config:guild-1')
        expect(redisMock.srem).toHaveBeenCalledWith(
            'mod-digest:enabled-guilds',
            'guild-1',
        )
    })

    it('returns false when no config exists', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(null)

        const result = await service.disable('guild-1')
        expect(result).toBe(false)
        expect(redisMock.del).not.toHaveBeenCalled()
    })
})

describe('ModDigestConfigService.get', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('parses stored JSON', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(
            JSON.stringify({
                guildId: 'g',
                channelId: 'c',
                enabled: true,
                lastSentAt: 123,
                createdAt: 1,
            }),
        )
        const config = await service.get('g')
        expect(config?.channelId).toBe('c')
        expect(config?.lastSentAt).toBe(123)
    })

    it('returns null when key is missing', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(null)
        const config = await service.get('missing')
        expect(config).toBeNull()
    })

    it('returns null and logs on parse error', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue('not-json')
        const config = await service.get('g')
        expect(config).toBeNull()
    })

    it('rejects payloads with missing fields', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(
            JSON.stringify({ guildId: 'g', channelId: 'c' }),
        )
        const config = await service.get('g')
        expect(config).toBeNull()
    })

    it('rejects payloads with wrong field types', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(
            JSON.stringify({
                guildId: 'g',
                channelId: 'c',
                enabled: 'yes',
                lastSentAt: null,
                createdAt: 1,
            }),
        )
        const config = await service.get('g')
        expect(config).toBeNull()
    })
})

describe('ModDigestConfigService.listEnabledGuildIds', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns Redis set members', async () => {
        const service = createService()
        redisMock.smembers.mockResolvedValue(['guild-a', 'guild-b'])
        const ids = await service.listEnabledGuildIds()
        expect(ids).toEqual(['guild-a', 'guild-b'])
    })

    it('returns empty array on Redis failure', async () => {
        const service = createService()
        redisMock.smembers.mockRejectedValue(new Error('boom'))
        const ids = await service.listEnabledGuildIds()
        expect(ids).toEqual([])
    })
})

describe('ModDigestConfigService.markSent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        redisMock.set.mockResolvedValue(true)
    })

    it('updates lastSentAt when config exists', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(
            JSON.stringify({
                guildId: 'g',
                channelId: 'c',
                enabled: true,
                lastSentAt: null,
                createdAt: 1,
            }),
        )

        await service.markSent('g', 999)

        const setCall = redisMock.set.mock.calls[0]
        expect(setCall[0]).toBe('mod-digest:config:g')
        const stored = JSON.parse(setCall[1] as string)
        expect(stored.lastSentAt).toBe(999)
    })

    it('does nothing when config is missing', async () => {
        const service = createService()
        redisMock.get.mockResolvedValue(null)
        await service.markSent('g', 999)
        expect(redisMock.set).not.toHaveBeenCalled()
    })
})
