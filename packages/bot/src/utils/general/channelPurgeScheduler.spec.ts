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
