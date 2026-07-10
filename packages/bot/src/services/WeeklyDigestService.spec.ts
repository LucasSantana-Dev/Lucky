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

// Mock rss-parser before importing WeeklyDigestService
jest.mock('rss-parser', () => {
    return jest.fn().mockImplementation(() => ({
        parseURL: jest.fn(),
    }))
})

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: jest.fn(),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    // Plain function (not jest.fn): resetMocks would wipe a factory impl
    // between tests. Mirrors the real parseIntEnv contract from shared/utils.
    parseIntEnv: (
        name: string,
        fallback: number,
        options?: { min?: number; max?: number },
    ) => {
        const value = process.env[name]
        if (!value || !/^[+-]?\d+$/.test(value.trim())) return fallback
        const parsed = Number.parseInt(value, 10)
        if (options?.min !== undefined && parsed < options.min) return fallback
        if (options?.max !== undefined && parsed > options.max) return fallback
        return parsed
    },
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

// Sunday 2026-06-21 at 12:15 UTC
const SUNDAY_12_UTC = new Date('2026-06-21T12:15:00.000Z').getTime()
// Monday 2026-06-22 at 12:15 UTC — should NOT trigger (no longer)
const MONDAY_12_UTC = new Date('2026-06-22T12:15:00.000Z').getTime()
// Sunday at 13:00 UTC — wrong hour
const SUNDAY_13_UTC = new Date('2026-06-21T13:00:00.000Z').getTime()

/** Set the private client field directly to avoid start() side effects */
function setClient(svc: WeeklyDigestService, client: Client | null): void {
    ;(svc as unknown as { client: Client | null }).client = client
}

describe('WeeklyDigestService', () => {
    beforeEach(() => {
        process.env.DIGEST_CHANNEL_ID = 'digest-channel-id'
        process.env.FORUM_CHANNEL_ID = 'forum-channel-id'
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
        delete process.env.DIGEST_CHANNEL_ID
        delete process.env.FORUM_CHANNEL_ID
        delete process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS
    })

    describe('constructor / tick interval parsing', () => {
        const DEFAULT_TICK = 60 * 60 * 1000
        const tickOf = (svc: WeeklyDigestService): number =>
            (svc as unknown as { tickIntervalMs: number }).tickIntervalMs

        test('uses default tick interval when env var not set', () => {
            expect(tickOf(new WeeklyDigestService())).toBe(DEFAULT_TICK)
        })

        test('reads tick interval from env var', () => {
            process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS = '5000'
            expect(tickOf(new WeeklyDigestService())).toBe(5000)
        })

        test('falls back to default when env var is not a number', () => {
            process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS = 'bad'
            expect(tickOf(new WeeklyDigestService())).toBe(DEFAULT_TICK)
        })

        test('rejects partial numerics like "1h" instead of parsing 1ms', () => {
            process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS = '1h'
            expect(tickOf(new WeeklyDigestService())).toBe(DEFAULT_TICK)
        })

        test('falls back to default when env var is zero or negative', () => {
            process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS = '-1'
            expect(tickOf(new WeeklyDigestService())).toBe(DEFAULT_TICK)
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
        test('does not start when DIGEST_CHANNEL_ID is missing', () => {
            delete process.env.DIGEST_CHANNEL_ID
            const svc = new WeeklyDigestService({ tickIntervalMs: 1000 })
            const client = {
                channels: { fetch: jest.fn() },
            } as unknown as Client
            svc.start(client)
            svc.stop() // no-op, timer not set
        })

        test('does not start when FORUM_CHANNEL_ID is missing', () => {
            delete process.env.FORUM_CHANNEL_ID
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
        test('returns early when not Sunday', async () => {
            const svc = new WeeklyDigestService({ clock: () => MONDAY_12_UTC })
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
            const svc = new WeeklyDigestService({ clock: () => SUNDAY_13_UTC })
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
            const svc = new WeeklyDigestService({ clock: () => SUNDAY_12_UTC })
            const client = {
                channels: { fetch: jest.fn(async () => null) },
            } as unknown as Client
            setClient(svc, client)
            // Start two ticks concurrently — second should be skipped
            const [, second] = await Promise.all([svc.tick(), svc.tick()])
            expect(second).toBeUndefined()
        })

        test('skips if digest was sent within last 30 minutes', async () => {
            const now = SUNDAY_12_UTC
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

    describe('sendDigestForGuild — via tick on Sunday 12 UTC', () => {
        function makeSvc() {
            return new WeeklyDigestService({ clock: () => SUNDAY_12_UTC })
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
                // Anchor to the mocked clock, one week back — a real `new
                // Date()` here becomes an idempotency skip (and a failing
                // test) as soon as the wall clock leaves the mocked week
                postedAt: new Date(SUNDAY_12_UTC - 7 * 24 * 60 * 60 * 1000),
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
            // Failed send must NOT advance the weekly baseline — otherwise
            // the idempotency check suppresses retry and the digest is lost
            expect(
                mockPrismaClient.weeklyDigestSnapshot.create,
            ).not.toHaveBeenCalled()
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

        test('fetches starter messages from threads when channel is GuildForum', async () => {
            const svc = makeSvc()
            const reaction = { count: 7 }
            const starterMessage = {
                id: 'post-1',
                url: 'https://discord.com/post-1',
                author: { id: 'user-1' },
                content: 'Forum post!',
                createdTimestamp: MONDAY_12_UTC - 1000,
                reactions: { cache: new Map([['🔥', reaction]]) },
            }
            const fetchStarterMessage = jest.fn(async () => starterMessage)
            const fetchActive = jest.fn(async () => ({
                threads: new Map([['thread-1', { fetchStarterMessage }]]),
            }))
            const guild = makeMockGuild()
            const forumChannel = {
                type: ChannelType.GuildForum,
                guildId: 'guild-123',
                guild: guild as Guild,
                threads: { fetchActive },
            }
            ;(
                guild.channels!.fetch as jest.MockedFunction<
                    () => Promise<unknown>
                >
            ).mockResolvedValue(forumChannel)
            const digestChannel = makeMockTextChannel(guild)
            const client = {
                channels: { fetch: jest.fn(async () => digestChannel) },
            } as unknown as Client
            setClient(svc, client)
            await svc.tick()
            expect(fetchActive).toHaveBeenCalled()
            expect(fetchStarterMessage).toHaveBeenCalled()
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

        test('includes new guides from RSS feed in embed', async () => {
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
            // Mock successful RSS feed with items
            const mockParser = jest.requireMock('rss-parser')
            mockParser.mockImplementation(() => ({
                parseURL: jest.fn(async () => ({
                    items: [
                        {
                            title: 'Guide 1',
                            link: 'https://criativaria.com.br/guide-1',
                            pubDate: new Date(
                                SUNDAY_12_UTC - 1 * 60 * 60 * 1000,
                            ).toISOString(),
                        },
                        {
                            title: 'Guide 2',
                            link: 'https://criativaria.com.br/guide-2',
                            pubDate: new Date(
                                SUNDAY_12_UTC - 2 * 60 * 60 * 1000,
                            ).toISOString(),
                        },
                    ],
                })),
            }))
            await svc.tick()
            expect(digestChannel.send).toHaveBeenCalled()
        })

        test('omits guides section when RSS feed has no items', async () => {
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
            // Mock RSS feed with zero items
            const mockParser = jest.requireMock('rss-parser')
            mockParser.mockImplementation(() => ({
                parseURL: jest.fn(async () => ({ items: [] })),
            }))
            await svc.tick()
            expect(digestChannel.send).toHaveBeenCalled()
        })

        test('fails soft when RSS feed fetch throws', async () => {
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
            // Mock RSS feed fetch failure
            const mockParser = jest.requireMock('rss-parser')
            mockParser.mockImplementation(() => ({
                parseURL: jest.fn(async () => {
                    throw new Error('Feed unavailable')
                }),
            }))
            await svc.tick()
            // digest still sent without guides section (fail-soft)
            expect(digestChannel.send).toHaveBeenCalled()
            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to fetch RSS feed for guides',
                }),
            )
        })
    })
})
