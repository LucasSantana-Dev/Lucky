import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { Collection } from 'discord.js'

const channelCleanupServiceMock = {
    getPurgeConfigsDue: jest.fn() as jest.MockedFunction<any>,
    getTtlConfigs: jest.fn() as jest.MockedFunction<any>,
    markPurgeExecuted: jest.fn() as jest.MockedFunction<any>,
}

jest.mock('@lucky/shared/services', () => ({
    channelCleanupService: channelCleanupServiceMock,
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

import { ChannelPurgeScheduler } from './channelPurgeScheduler'

const GUILD = 'g1'
const CHANNEL = 'c1'

/** Fake TextChannel returning `messages`; bulkDelete uses `bulkDelete` impl. */
function makeChannel(
    messages: Collection<string, any>,
    bulkDelete: jest.MockedFunction<any>,
) {
    return {
        isTextBased: () => true,
        guild: { id: GUILD },
        messages: { fetch: jest.fn().mockResolvedValue(messages) },
        bulkDelete,
    }
}

function makeClient(channel: unknown) {
    return {
        channels: { fetch: jest.fn().mockResolvedValue(channel) },
    } as never
}

/** Invoke one full tick deterministically (await to completion). */
async function runTick(client: unknown) {
    const scheduler = new ChannelPurgeScheduler()
    ;(scheduler as unknown as { client: unknown }).client = client
    await (scheduler as unknown as { tick: () => Promise<void> }).tick()
}

function msg(id: string, ageMs: number, bot = false) {
    return { id, author: { bot }, createdTimestamp: Date.now() - ageMs }
}

describe('ChannelPurgeScheduler.tick — purge', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([])
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([])
    })

    const purgeConfig = {
        id: 'p1',
        guildId: GUILD,
        channelId: CHANNEL,
        mode: 'purge_interval',
        intervalMinutes: 60,
        ttlSeconds: null,
    }

    it('marks purge executed after a successful delete', async () => {
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([
            purgeConfig,
        ])
        const bulkDelete = jest.fn().mockResolvedValue({ size: 1 })
        const channel = makeChannel(
            new Collection([['m1', msg('m1', 1000)]]),
            bulkDelete,
        )

        await runTick(makeClient(channel))

        expect(bulkDelete).toHaveBeenCalledTimes(1)
        expect(
            channelCleanupServiceMock.markPurgeExecuted,
        ).toHaveBeenCalledWith('p1')
    })

    it('does NOT mark executed when a delete fails, so the next tick retries', async () => {
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([
            purgeConfig,
        ])
        const bulkDelete = jest
            .fn()
            .mockRejectedValue(new Error('missing ManageMessages'))
        const channel = makeChannel(
            new Collection([['m1', msg('m1', 1000)]]),
            bulkDelete,
        )

        await runTick(makeClient(channel))

        expect(
            channelCleanupServiceMock.markPurgeExecuted,
        ).not.toHaveBeenCalled()
    })
})

describe('ChannelPurgeScheduler.tick — TTL sweep (durable backstop)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([])
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([])
    })

    const ttlConfig = {
        id: 't1',
        guildId: GUILD,
        channelId: CHANNEL,
        mode: 'ttl',
        intervalMinutes: null,
        ttlSeconds: 60,
    }

    it('bulk-deletes only expired non-bot messages', async () => {
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([ttlConfig])
        const bulkDelete = jest.fn().mockResolvedValue({ size: 1 })
        const messages = new Collection<string, any>([
            ['expired', msg('expired', 120_000)], // 120s old, ttl 60s → delete
            ['fresh', msg('fresh', 10_000)], // 10s old → keep
            ['botOld', msg('botOld', 120_000, true)], // bot → keep
        ])
        const channel = makeChannel(messages, bulkDelete)

        await runTick(makeClient(channel))

        expect(bulkDelete).toHaveBeenCalledTimes(1)
        const swept = bulkDelete.mock.calls[0][0] as Collection<string, any>
        expect(swept.size).toBe(1)
        expect(swept.has('expired')).toBe(true)
    })

    it('does nothing when no message is expired', async () => {
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([ttlConfig])
        const bulkDelete = jest.fn().mockResolvedValue({ size: 0 })
        const channel = makeChannel(
            new Collection([['fresh', msg('fresh', 5_000)]]),
            bulkDelete,
        )

        await runTick(makeClient(channel))

        expect(bulkDelete).not.toHaveBeenCalled()
    })

    it('skips configs with an out-of-range ttl', async () => {
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([
            { ...ttlConfig, ttlSeconds: 999999 },
        ])
        const bulkDelete = jest.fn()
        const channel = makeChannel(new Collection(), bulkDelete)
        const client = makeClient(channel)

        await runTick(client)

        expect(
            (client as { channels: { fetch: jest.Mock } }).channels.fetch,
        ).not.toHaveBeenCalled()
    })
})
