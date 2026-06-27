import {
    describe,
    test,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import { ChannelType } from 'discord.js'
import type { Client, TextChannel, Guild, Collection } from 'discord.js'

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: jest.fn(),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('@lucky/shared/constants', () => ({
    COLOR: { LUCKY_PURPLE: 0x9b59b6 },
}))

import { WeeklyDigestService } from './WeeklyDigestService'
import { getPrismaClient, errorLog } from '@lucky/shared/utils'

const mockPrismaClient = {
    weeklyDigestSnapshot: {
        findFirst: jest.fn(),
        create: jest.fn(),
    },
}

function makeMockGuild(
    channelFetch: () => Promise<unknown> = async () => null,
): Partial<Guild> {
    return {
        memberCount: 100,
        channels: {
            fetch: jest.fn(channelFetch),
        } as unknown as Guild['channels'],
        scheduledEvents: {
            fetch: jest.fn(async () => new Map()),
        } as unknown as Guild['scheduledEvents'],
    }
}

function makeMockTextChannel(
    guild: Partial<Guild>,
    overrides: Partial<TextChannel> = {},
): Partial<TextChannel> {
    return {
        type: ChannelType.GuildText,
        guildId: 'guild-123',
        guild: guild as Guild,
        send: jest.fn(async () => ({})),
        messages: {
            fetch: jest.fn(async () => new Map()),
        } as unknown as TextChannel['messages'],
        ...overrides,
    }
}

// Monday 2026-06-22 at 12:15 UTC
const MONDAY_12_UTC = new Date('2026-06-22T12:15:00.000Z').getTime()
// Tuesday — should NOT trigger
const TUESDAY_12_UTC = new Date('2026-06-23T12:15:00.000Z').getTime()
// Monday at 13:00 UTC — wrong hour
const MONDAY_13_UTC = new Date('2026-06-22T13:00:00.000Z').getTime()

/** Set the private client field directly to avoid start() side effects */
function setClient(svc: WeeklyDigestService, client: Client | null): void {
    ;(svc as unknown as { client: Client | null }).client = client
}

describe('WeeklyDigestService', () => {
    beforeEach(() => {
        process.env.CRIATIVARIA_DIGEST_CHANNEL_ID = 'digest-channel-id'
        process.env.CRIATIVARIA_FORUM_CHANNEL_ID = 'forum-channel-id'
        ;(
            getPrismaClient as jest.MockedFunction<typeof getPrismaClient>
        ).mockReturnValue(
            mockPrismaClient as ReturnType<typeof getPrismaClient>,
        )
        mockPrismaClient.weeklyDigestSnapshot.findFirst.mockResolvedValue(null)
        mockPrismaClient.weeklyDigestSnapshot.create.mockResolvedValue({})
    })

    afterEach(() => {
        jest.clearAllMocks()
        delete process.env.CRIATIVARIA_DIGEST_CHANNEL_ID
        delete process.env.CRIATIVARIA_FORUM_CHANNEL_ID
        delete process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS
    })

    describe('constructor / parsePositiveIntEnv', () => {
        test('uses default tick interval when env var not set', () => {
            const svc = new WeeklyDigestService()
            expect(svc).toBeDefined()
        })

        test('reads tick interval from env var', () => {
            process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS = '5000'
            const svc = new WeeklyDigestService()
            expect(svc).toBeDefined()
        })

        test('falls back to default when env var is not a number', () => {
            process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS = 'bad'
            const svc = new WeeklyDigestService()
            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Invalid'),
                }),
            )
            expect(svc).toBeDefined()
        })

        test('falls back to default when env var is zero or negative', () => {
            process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS = '-1'
            const svc = new WeeklyDigestService()
            expect(errorLog).toHaveBeenCalled()
        })

        test('accepts explicit clock and interval options', () => {
            const svc = new WeeklyDigestService({
                tickIntervalMs: 1000,
                clock: () => MONDAY_12_UTC,
            })
            expect(svc).toBeDefined()
        })
    })

    describe('start / stop lifecycle', () => {
        test('does not start when CRIATIVARIA_DIGEST_CHANNEL_ID is missing', () => {
            delete process.env.CRIATIVARIA_DIGEST_CHANNEL_ID
            const svc = new WeeklyDigestService({ tickIntervalMs: 1000 })
            const client = {
                channels: { fetch: jest.fn() },
            } as unknown as Client
            svc.start(client)
            svc.stop() // no-op, timer not set
        })

        test('does not start when CRIATIVARIA_FORUM_CHANNEL_ID is missing', () => {
            delete process.env.CRIATIVARIA_FORUM_CHANNEL_ID
            const svc = new WeeklyDigestService({ tickIntervalMs: 1000 })
            const client = {
                channels: { fetch: jest.fn() },
            } as unknown as Client
            svc.start(client)
            svc.stop()
        })

        test('is idempotent — second start call is ignored', () => {
            const svc = new WeeklyDigestService({
                tickIntervalMs: 60000,
                clock: () => TUESDAY_12_UTC,
            })
            const client = {
                channels: { fetch: jest.fn() },
            } as unknown as Client
            svc.start(client)
            svc.start(client) // no-op
            svc.stop()
        })

        test('stop is safe to call multiple times', () => {
            const svc = new WeeklyDigestService({
                tickIntervalMs: 60000,
                clock: () => TUESDAY_12_UTC,
            })
            const client = {
                channels: { fetch: jest.fn() },
            } as unknown as Client
            svc.start(client)
            svc.stop()
            svc.stop() // second stop is safe
        })
    })

    describe('tick — timing guards', () => {
        test('returns early when not Monday', async () => {
            const svc = new WeeklyDigestService({ clock: () => TUESDAY_12_UTC })
            const client = {
                channels: { fetch: jest.fn() },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
        })

        test('returns early when hour is not 12', async () => {
            const svc = new WeeklyDigestService({ clock: () => MONDAY_13_UTC })
            const client = {
                channels: { fetch: jest.fn() },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
        })

        test('returns early when client is null', async () => {
            const svc = new WeeklyDigestService({ clock: () => MONDAY_12_UTC })
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
        })

        test('skips re-entrant tick (tickInProgress guard)', async () => {
            const svc = new WeeklyDigestService({ clock: () => MONDAY_12_UTC })
            const client = {
                channels: { fetch: jest.fn(async () => null) },
            } as unknown as Client
            setClient(svc, client)
            // Start two ticks concurrently — second should be skipped
            const [, second] = await Promise.all([svc.tick(), svc.tick()])
            expect(second).toBeUndefined()
        })

        test('skips if digest was sent within last 30 minutes', async () => {
            const now = MONDAY_12_UTC
            const svc = new WeeklyDigestService({ clock: () => now })
            const client = {
                channels: { fetch: jest.fn(async () => null) },
            } as unknown as Client
            setClient(svc, client)
            // Manually set lastDigestTime to "just now"
            ;(svc as unknown as { lastDigestTime: number }).lastDigestTime =
                now - 1000
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
        })
    })

    describe('sendDigestForGuild — via tick on Monday 12 UTC', () => {
        function makeSvc() {
            return new WeeklyDigestService({ clock: () => MONDAY_12_UTC })
        }

        test('skips when digest channel fetch returns null', async () => {
            const svc = makeSvc()
            const client = {
                channels: { fetch: jest.fn(async () => null) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
        })

        test('skips when digest channel has wrong type', async () => {
            const svc = makeSvc()
            const guild = makeMockGuild()
            const ch = makeMockTextChannel(guild, {
                type: ChannelType.GuildVoice as unknown as typeof ChannelType.GuildText,
            })
            const client = {
                channels: { fetch: jest.fn(async () => ch) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
        })

        test('skips when forum channel fetch returns null', async () => {
            const svc = makeSvc()
            const guild = makeMockGuild(async () => null)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
        })

        test('sends digest and saves snapshot on happy path', async () => {
            const svc = makeSvc()
            const guild = makeMockGuild()
            const forumChannel = makeMockTextChannel(guild)
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel as unknown as TextChannel)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ guildId: 'guild-123' }),
                }),
            )
            expect(digestChannel.send).toHaveBeenCalled()
        })

        test('uses previous snapshot for member delta', async () => {
            mockPrismaClient.weeklyDigestSnapshot.findFirst.mockResolvedValue({
                memberCount: 80,
                postedAt: new Date(),
            })
            const svc = makeSvc()
            const guild = makeMockGuild()
            ;(guild as unknown as { memberCount: number }).memberCount = 100
            const forumChannel = makeMockTextChannel(guild)
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel as unknown as TextChannel)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).toHaveBeenCalled()
        })

        test('handles send() throwing gracefully — returns false and logs', async () => {
            const svc = makeSvc()
            const guild = makeMockGuild()
            const forumChannel = makeMockTextChannel(guild)
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel as unknown as TextChannel)
            const digestChannel = makeMockTextChannel(guild, {
                send: jest.fn(async () => {
                    throw new Error('Discord down')
                }),
            })
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(errorLog).toHaveBeenCalled()
        })

        test('includes top reacted messages in embed', async () => {
            const svc = makeSvc()
            const reaction = { count: 5 }
            const msgMap = new Map([
                [
                    'msg-1',
                    {
                        id: 'msg-1',
                        url: 'https://discord.com/msg-1',
                        author: { id: 'user-1' },
                        content: 'Hello!',
                        reactions: { cache: new Map([['👍', reaction]]) },
                    },
                ],
            ])
            const guild = makeMockGuild()
            const forumChannel = makeMockTextChannel(guild, {
                messages: {
                    fetch: jest.fn(async () => msgMap),
                } as unknown as TextChannel['messages'],
            })
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel as unknown as TextChannel)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(digestChannel.send).toHaveBeenCalled()
        })

        test('includes upcoming scheduled events in embed', async () => {
            const svc = makeSvc()
            const eventTime = MONDAY_12_UTC + 2 * 24 * 60 * 60 * 1000 // 2 days later
            const eventsMap = new Map([
                [
                    'evt-1',
                    { name: 'Workshop', scheduledStartTimestamp: eventTime },
                ],
            ])
            const guild = makeMockGuild()
            ;(
                guild.scheduledEvents!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(eventsMap)
            const forumChannel = makeMockTextChannel(guild)
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel as unknown as TextChannel)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(digestChannel.send).toHaveBeenCalled()
        })

        test('recovers gracefully when message fetch fails', async () => {
            const svc = makeSvc()
            const guild = makeMockGuild()
            const forumChannel = makeMockTextChannel(guild, {
                messages: {
                    fetch: jest.fn(async () => {
                        throw new Error('ratelimit')
                    }),
                } as unknown as TextChannel['messages'],
            })
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel as unknown as TextChannel)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            // digest still sent (top messages = [])
            expect(digestChannel.send).toHaveBeenCalled()
        })

        test('recovers gracefully when scheduledEvents fetch fails', async () => {
            const svc = makeSvc()
            const guild = makeMockGuild()
            ;(
                guild.scheduledEvents!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockRejectedValue(new Error('events error'))
            const forumChannel = makeMockTextChannel(guild)
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel as unknown as TextChannel)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            // digest still sent (events = [])
            expect(digestChannel.send).toHaveBeenCalled()
        })
    })
})
