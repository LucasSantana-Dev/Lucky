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

describe('ChannelPurgeScheduler — lifecycle & config', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([])
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([])
    })

    afterEach(() => {
        jest.useRealTimers()
        process.env = ORIGINAL_ENV
    })

    it('falls back to the default interval on an invalid env value', () => {
        process.env = {
            ...ORIGINAL_ENV,
            CHANNEL_PURGE_TICK_INTERVAL_MS: 'not-a-number',
        }
        expect(() => new ChannelPurgeScheduler()).not.toThrow()
    })

    it('accepts a valid env interval', () => {
        process.env = {
            ...ORIGINAL_ENV,
            CHANNEL_PURGE_TICK_INTERVAL_MS: '120000',
        }
        expect(() => new ChannelPurgeScheduler()).not.toThrow()
    })

    it('start() schedules a timer and stop() clears it (idempotent)', () => {
        const scheduler = new ChannelPurgeScheduler({ tickIntervalMs: 60000 })
        const client = { channels: { fetch: jest.fn() } } as never
        scheduler.start(client)
        // Second start is a no-op (timer already set).
        scheduler.start(client)
        scheduler.stop()
        // Second stop is a no-op.
        scheduler.stop()
    })
})

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

    it('skips a ttl channel that is not found', async () => {
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([ttlConfig])
        await expect(runTick(makeClient(null))).resolves.toBeUndefined()
    })

    it('skips a ttl channel in another guild', async () => {
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([ttlConfig])
        const bulkDelete = jest.fn()
        const channel = {
            isTextBased: () => true,
            guild: { id: 'other-guild' },
            messages: { fetch: jest.fn() },
            bulkDelete,
        }

        await runTick(makeClient(channel))

        expect(bulkDelete).not.toHaveBeenCalled()
    })
})

describe('ChannelPurgeScheduler.tick — purge branches', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([])
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([])
    })

    const cfg = {
        id: 'p1',
        guildId: GUILD,
        channelId: CHANNEL,
        mode: 'purge_interval',
        intervalMinutes: 60,
        ttlSeconds: null,
    }

    it('skips and does not mark executed when the channel is not found', async () => {
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([cfg])

        await runTick(makeClient(null))

        expect(
            channelCleanupServiceMock.markPurgeExecuted,
        ).not.toHaveBeenCalled()
    })

    it('skips a channel that belongs to another guild', async () => {
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([cfg])
        const bulkDelete = jest.fn()
        const channel = {
            isTextBased: () => true,
            guild: { id: 'other-guild' },
            messages: { fetch: jest.fn() },
            bulkDelete,
        }

        await runTick(makeClient(channel))

        expect(bulkDelete).not.toHaveBeenCalled()
        expect(
            channelCleanupServiceMock.markPurgeExecuted,
        ).not.toHaveBeenCalled()
    })

    it('marks executed (no delete) when the channel is already empty', async () => {
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([cfg])
        const bulkDelete = jest.fn()
        const channel = makeChannel(new Collection(), bulkDelete)

        await runTick(makeClient(channel))

        expect(bulkDelete).not.toHaveBeenCalled()
        expect(
            channelCleanupServiceMock.markPurgeExecuted,
        ).toHaveBeenCalledWith('p1')
    })

    it('loops across a full page then stops on a short page', async () => {
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([cfg])
        const full = new Collection<string, any>(
            Array.from({ length: 100 }, (_, i) => [
                String(i),
                msg(String(i), 1000),
            ]),
        )
        const short = new Collection<string, any>([['x', msg('x', 1000)]])
        const fetch = jest
            .fn()
            .mockResolvedValueOnce(full)
            .mockResolvedValueOnce(short)
        const bulkDelete = jest
            .fn()
            .mockResolvedValueOnce({ size: 100 })
            .mockResolvedValueOnce({ size: 1 })
        const channel = {
            isTextBased: () => true,
            guild: { id: GUILD },
            messages: { fetch },
            bulkDelete,
        }

        await runTick(makeClient(channel))

        expect(bulkDelete).toHaveBeenCalledTimes(2)
        expect(
            channelCleanupServiceMock.markPurgeExecuted,
        ).toHaveBeenCalledWith('p1')
    })

    it('swallows an unexpected per-config error (e.g. markPurgeExecuted throws)', async () => {
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([cfg])
        channelCleanupServiceMock.markPurgeExecuted.mockRejectedValue(
            new Error('db down'),
        )
        const bulkDelete = jest.fn().mockResolvedValue({ size: 1 })
        const channel = makeChannel(
            new Collection([['m1', msg('m1', 1000)]]),
            bulkDelete,
        )

        // A throw in one config must not break the whole tick.
        await expect(runTick(makeClient(channel))).resolves.toBeUndefined()
    })
})

describe('ChannelPurgeScheduler.tick — TTL sweep errors', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        channelCleanupServiceMock.getPurgeConfigsDue.mockResolvedValue([])
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([])
    })

    it('swallows a per-channel sweep error and continues', async () => {
        channelCleanupServiceMock.getTtlConfigs.mockResolvedValue([
            {
                id: 't1',
                guildId: GUILD,
                channelId: CHANNEL,
                mode: 'ttl',
                intervalMinutes: null,
                ttlSeconds: 60,
            },
        ])
        const channel = {
            isTextBased: () => true,
            guild: { id: GUILD },
            messages: {
                fetch: jest.fn().mockRejectedValue(new Error('rate limit')),
            },
            bulkDelete: jest.fn(),
        }

        await expect(runTick(makeClient(channel))).resolves.toBeUndefined()
    })
})
