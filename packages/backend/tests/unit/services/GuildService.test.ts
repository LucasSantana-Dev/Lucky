import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import { guildService, setBotClient } from '../../../src/services/GuildService'
import { discordOAuthService } from '../../../src/services/DiscordOAuthService'
import {
    MOCK_DISCORD_GUILDS,
    MOCK_TOKEN_RESPONSE,
} from '../../fixtures/mock-data'
import type { Client, Guild } from 'discord.js'

const originalFetch = global.fetch

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        getUserGuilds: jest.fn(),
        filterAdminGuilds: jest.fn(),
    },
}))

describe('GuildService', () => {
    let originalDiscordToken: string | undefined

    beforeEach(() => {
        jest.clearAllMocks()
        setBotClient(null)
        originalDiscordToken = process.env.DISCORD_TOKEN
        delete process.env.DISCORD_TOKEN
        global.fetch = originalFetch
    })

    afterEach(() => {
        if (originalDiscordToken === undefined) {
            delete process.env.DISCORD_TOKEN
        } else {
            process.env.DISCORD_TOKEN = originalDiscordToken
        }
        global.fetch = originalFetch
    })

    describe('getUserGuilds', () => {
        test('should fetch and filter user guilds successfully', async () => {
            const mockDiscordOAuth = discordOAuthService as jest.Mocked<
                typeof discordOAuthService
            >
            mockDiscordOAuth.getUserGuilds.mockResolvedValue(
                MOCK_DISCORD_GUILDS,
            )
            mockDiscordOAuth.filterAdminGuilds.mockReturnValue(
                MOCK_DISCORD_GUILDS,
            )

            const result = await guildService.getUserGuilds(
                MOCK_TOKEN_RESPONSE.access_token,
            )

            expect(result).toEqual(MOCK_DISCORD_GUILDS)
            expect(mockDiscordOAuth.getUserGuilds).toHaveBeenCalledWith(
                MOCK_TOKEN_RESPONSE.access_token,
            )
            expect(mockDiscordOAuth.filterAdminGuilds).toHaveBeenCalledWith(
                MOCK_DISCORD_GUILDS,
            )
        })

        test('should throw error when guild fetch fails', async () => {
            const mockDiscordOAuth = discordOAuthService as jest.Mocked<
                typeof discordOAuthService
            >
            mockDiscordOAuth.getUserGuilds.mockRejectedValue(
                new Error('API error'),
            )

            await expect(
                guildService.getUserGuilds(MOCK_TOKEN_RESPONSE.access_token),
            ).rejects.toThrow('API error')
        })
    })

    describe('checkBotInGuild', () => {
        test('should return true when bot is in guild', () => {
            const mockGuild = {
                id: '111111111111111111',
            } as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)

            const result = guildService.checkBotInGuild('111111111111111111')

            expect(result).toBe(true)
        })

        test('should return false when bot is not in guild', () => {
            const mockClient = {
                guilds: {
                    cache: new Map(),
                },
            } as unknown as Client

            setBotClient(mockClient)

            const result = guildService.checkBotInGuild('111111111111111111')

            expect(result).toBe(false)
        })

        test('should return false when client is not set', () => {
            setBotClient(null)

            const result = guildService.checkBotInGuild('111111111111111111')

            expect(result).toBe(false)
        })
    })

    describe('generateBotInviteUrl', () => {
        test('should generate invite URL with guild ID', () => {
            const guildId = '111111111111111111'
            const result = guildService.generateBotInviteUrl(guildId)

            expect(result).toContain('discord.com/api/oauth2/authorize')
            expect(result).toContain(`guild_id=${guildId}`)
            expect(result).toContain('client_id=test-client-id')
            expect(result).toContain('permissions=8')
            expect(result).toContain('scope=bot')
        })

        test('should generate invite URL without guild ID', () => {
            const result = guildService.generateBotInviteUrl()

            expect(result).toContain('discord.com/api/oauth2/authorize')
            expect(result).not.toContain('guild_id=')
            expect(result).toContain('client_id=test-client-id')
        })

        test('should throw error when CLIENT_ID is not configured', () => {
            const originalClientId = process.env.CLIENT_ID
            delete process.env.CLIENT_ID

            expect(() => guildService.generateBotInviteUrl()).toThrow(
                'CLIENT_ID not configured',
            )

            process.env.CLIENT_ID = originalClientId
        })
    })

    describe('enrichGuildsWithBotStatus', () => {
        test('should enrich guilds with bot status', async () => {
            const mockGuild = {
                id: '111111111111111111',
                memberCount: 10,
                channels: { cache: new Map() },
                roles: { cache: new Map() },
            } as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)

            const result =
                await guildService.enrichGuildsWithBotStatus(
                    MOCK_DISCORD_GUILDS,
                )

            expect(result).toHaveLength(2)
            expect(result[0].hasBot).toBe(true)
            expect(result[0].botInviteUrl).toBeUndefined()
            expect(result[1].hasBot).toBe(false)
            expect(result[1].botInviteUrl).toBeDefined()
        })

        test('should use Discord API fallback when bot client is unavailable', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => [{ id: '111111111111111111' }],
            } as never) as unknown as typeof fetch

            const result =
                await guildService.enrichGuildsWithBotStatus(
                    MOCK_DISCORD_GUILDS,
                )

            expect(result[0].hasBot).toBe(true)
            expect(result[0].botInviteUrl).toBeUndefined()
            expect(result[1].hasBot).toBe(false)
            expect(result[1].botInviteUrl).toBeDefined()
            expect(global.fetch).toHaveBeenCalledWith(
                'https://discord.com/api/v10/users/@me/guilds',
                expect.objectContaining({
                    headers: { Authorization: 'Bot test-bot-token' },
                }),
            )
        })

        test('should keep processing guilds when Discord API fallback fails', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'discord api unavailable',
            } as never) as unknown as typeof fetch

            const result =
                await guildService.enrichGuildsWithBotStatus(
                    MOCK_DISCORD_GUILDS,
                )

            expect(result[0].hasBot).toBe(false)
            expect(result[1].hasBot).toBe(false)
            expect(result[0].botInviteUrl).toBeDefined()
            expect(result[1].botInviteUrl).toBeDefined()
        })

        test('should cache Discord API fallback guild ids for short periods', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => [{ id: '111111111111111111' }],
            } as never)
            global.fetch = fetchMock as unknown as typeof fetch

            await guildService.enrichGuildsWithBotStatus(MOCK_DISCORD_GUILDS)
            await guildService.enrichGuildsWithBotStatus(MOCK_DISCORD_GUILDS)

            const botGuildLookups = fetchMock.mock.calls.filter(
                ([url]) =>
                    url === 'https://discord.com/api/v10/users/@me/guilds',
            )
            expect(botGuildLookups).toHaveLength(1)
        })

        test('should set botInviteUrl when bot is not in guild', async () => {
            setBotClient(null)

            const result = await guildService.enrichGuildsWithBotStatus([
                MOCK_DISCORD_GUILDS[0],
            ])

            expect(result[0].hasBot).toBe(false)
            expect(result[0].botInviteUrl).toBeDefined()
            expect(result[0].botInviteUrl).toContain(MOCK_DISCORD_GUILDS[0].id)
        })
    })

    describe('hasBotInGuild', () => {
        test('should use Discord API fallback guild ids when bot client misses', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => [{ id: '111111111111111111' }],
            } as never) as unknown as typeof fetch

            const result = await guildService.hasBotInGuild('111111111111111111')

            expect(result).toBe(true)
        })
    })

    describe('getGuildMemberContext', () => {
        test('should resolve member context from bot client', async () => {
            const mockGuild = {
                id: '111111111111111111',
                members: {
                    fetch: jest.fn().mockResolvedValue({
                        nickname: 'nickname',
                        roles: {
                            cache: new Map([
                                ['111111111111111111', {}],
                                ['222222222222222222', {}],
                                ['333333333333333333', {}],
                            ]),
                        },
                    }),
                },
            } as unknown as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)

            const result = await guildService.getGuildMemberContext(
                '111111111111111111',
                'user-1',
            )

            expect(result).toEqual({
                nickname: 'nickname',
                roleIds: ['222222222222222222', '333333333333333333'],
            })
        })

        test('should fallback to Discord API when bot client lookup fails', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const mockClient = {
                guilds: {
                    cache: new Map(),
                    fetch: jest.fn().mockRejectedValue(new Error('unavailable')),
                },
            } as unknown as Client

            setBotClient(mockClient)
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    nick: 'api-nick',
                    roles: ['444444444444444444'],
                }),
            } as never) as unknown as typeof fetch

            const result = await guildService.getGuildMemberContext(
                '111111111111111111',
                'user-1',
            )

            expect(result).toEqual({
                nickname: 'api-nick',
                roleIds: ['444444444444444444'],
            })
        })
    })

    describe('getGuildRoleOptions', () => {
        test('should return sorted roles from bot client when available', async () => {
            const mockGuild = {
                id: '111111111111111111',
                roles: {
                    fetch: jest.fn().mockResolvedValue(
                        new Map([
                            [
                                '111111111111111111',
                                {
                                    id: '111111111111111111',
                                    name: '@everyone',
                                    color: 0,
                                    position: 0,
                                },
                            ],
                            [
                                '999999999999999999',
                                {
                                    id: '999999999999999999',
                                    name: 'Admins',
                                    color: 16711680,
                                    position: 9,
                                },
                            ],
                            [
                                '888888888888888888',
                                {
                                    id: '888888888888888888',
                                    name: 'Mods',
                                    color: 255,
                                    position: 5,
                                },
                            ],
                        ]),
                    ),
                },
            } as unknown as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)

            const result = await guildService.getGuildRoleOptions(
                '111111111111111111',
            )

            expect(result).toEqual([
                {
                    id: '999999999999999999',
                    name: 'Admins',
                    color: 16711680,
                    position: 9,
                },
                {
                    id: '888888888888888888',
                    name: 'Mods',
                    color: 255,
                    position: 5,
                },
            ])
        })

        test('should fallback to Discord API for roles when bot client is unavailable', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            setBotClient(null)
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => [
                    {
                        id: '555555555555555555',
                        name: 'Helpers',
                        color: 100,
                        position: 2,
                    },
                    {
                        id: '666666666666666666',
                        name: 'Owners',
                        color: 200,
                        position: 10,
                    },
                ],
            } as never) as unknown as typeof fetch

            const result = await guildService.getGuildRoleOptions(
                '111111111111111111',
            )

            expect(result).toEqual([
                {
                    id: '666666666666666666',
                    name: 'Owners',
                    color: 200,
                    position: 10,
                },
                {
                    id: '555555555555555555',
                    name: 'Helpers',
                    color: 100,
                    position: 2,
                },
            ])
        })
    })

    describe('getGuildTextChannelOptions', () => {
        test('returns sorted text channel options from bot client', async () => {
            const guildId = '111111111111111111'
            const mockGuild = {
                id: guildId,
                channels: {
                    fetch: jest.fn().mockResolvedValue(
                        new Map([
                            [
                                '1',
                                {
                                    id: '1',
                                    name: 'updates',
                                    type: 0,
                                    rawPosition: 20,
                                },
                            ],
                            [
                                '2',
                                {
                                    id: '2',
                                    name: 'voice-room',
                                    type: 2,
                                    rawPosition: 1,
                                },
                            ],
                            [
                                '3',
                                {
                                    id: '3',
                                    name: 'general',
                                    type: 5,
                                    rawPosition: 2,
                                },
                            ],
                        ]),
                    ),
                },
            } as unknown as Guild

            setBotClient({
                guilds: {
                    cache: new Map([[guildId, mockGuild]]),
                    fetch: jest.fn(),
                },
            } as unknown as Client)

            const channels = await guildService.getGuildTextChannelOptions(
                guildId,
            )

            expect(channels).toEqual([
                { id: '3', name: '#general' },
                { id: '1', name: '#updates' },
            ])
        })

        test('falls back to Discord API channel list when client path fails', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            const guildId = '111111111111111111'

            setBotClient({
                guilds: {
                    cache: new Map(),
                    fetch: jest
                        .fn()
                        .mockRejectedValue(new Error('client fail')),
                },
            } as unknown as Client)

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => [
                    { id: '2', name: 'rules', type: 5, position: 10 },
                    { id: '1', name: 'general', type: 0, position: 1 },
                    { id: '3', name: 'voice', type: 2, position: 2 },
                    { id: '4', type: 0, position: 3 },
                ],
            } as never) as unknown as typeof fetch

            const channels = await guildService.getGuildTextChannelOptions(
                guildId,
            )

            expect(channels).toEqual([
                { id: '1', name: '#general' },
                { id: '2', name: '#rules' },
            ])
        })

        test('returns empty list when bot token is unavailable', async () => {
            delete process.env.DISCORD_TOKEN
            setBotClient(null)

            const channels = await guildService.getGuildTextChannelOptions(
                '111111111111111111',
            )

            expect(channels).toEqual([])
        })
    })

    describe('getGuildDetails', () => {
        test('should return guild details when bot is in guild', async () => {
            const mockGuild = {
                id: '111111111111111111',
                name: 'Test Server',
                icon: 'test_icon',
                features: ['COMMUNITY'],
                memberCount: 10,
                channels: { cache: new Map() },
                roles: { cache: new Map() },
            } as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)

            const result =
                await guildService.getGuildDetails('111111111111111111')

            expect(result).not.toBeNull()
            expect(result?.id).toBe('111111111111111111')
            expect(result?.hasBot).toBe(true)
            expect(result?.botInviteUrl).toBeDefined()
        })

        test('should return null when bot is not in guild', async () => {
            const mockClient = {
                guilds: {
                    cache: new Map(),
                },
            } as unknown as Client

            setBotClient(mockClient)

            const result =
                await guildService.getGuildDetails('111111111111111111')

            expect(result).toBeNull()
        })

        test('should return null when client is not set', async () => {
            setBotClient(null)

            const result =
                await guildService.getGuildDetails('111111111111111111')

            expect(result).toBeNull()
        })
    })

    describe('guild metrics resolution', () => {
        test('counts category, voice and text channel types from client cache', async () => {
            const guildId = '111111111111111111'
            const mockGuild = {
                id: guildId,
                memberCount: 123,
                channels: {
                    cache: new Map([
                        ['c1', { type: 4 }],
                        ['c2', { type: 2 }],
                        ['c3', { type: 13 }],
                        ['c4', { type: 0 }],
                        ['c5', { type: 5 }],
                        ['c6', { type: 15 }],
                        ['c7', { type: 16 }],
                    ]),
                },
                roles: {
                    cache: new Map([
                        ['r1', { id: 'r1' }],
                        ['r2', { id: 'r2' }],
                    ]),
                },
            } as Guild

            setBotClient({
                guilds: {
                    cache: new Map([[guildId, mockGuild]]),
                },
            } as unknown as Client)

            const metrics = await guildService.getGuildMetrics(guildId)

            expect(metrics).toEqual({
                memberCount: 123,
                categoryCount: 1,
                textChannelCount: 4,
                voiceChannelCount: 2,
                roleCount: 2,
            })
        })

        test('merges client unknown metrics with Discord API fallback metrics', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            const guildId = '111111111111111111'
            const mockGuild = {
                id: guildId,
                memberCount: 0,
                channels: { cache: new Map() },
                roles: { cache: new Map() },
            } as Guild

            setBotClient({
                guilds: {
                    cache: new Map([[guildId, mockGuild]]),
                },
            } as unknown as Client)

            global.fetch = jest
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        approximate_member_count: 99,
                    }),
                } as never)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [{ type: 0 }, { type: 4 }, { type: 2 }],
                } as never)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => [{ id: '1' }, { id: '2' }],
                } as never) as unknown as typeof fetch

            const metrics = await guildService.getGuildMetrics(guildId)

            expect(metrics).toEqual({
                memberCount: 99,
                categoryCount: 1,
                textChannelCount: 1,
                voiceChannelCount: 1,
                roleCount: 2,
            })
        })

        test('returns empty metrics when Discord guild metrics endpoint fails', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            setBotClient(null)
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
            } as never) as unknown as typeof fetch

            const metrics =
                await guildService.getGuildMetrics('111111111111111111')

            expect(metrics).toEqual({
                memberCount: null,
                categoryCount: null,
                textChannelCount: null,
                voiceChannelCount: null,
                roleCount: null,
            })
        })

        test('returns empty metrics when Discord API request throws', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            setBotClient(null)
            global.fetch = jest
                .fn()
                .mockRejectedValue(new Error('boom')) as unknown as typeof fetch

            const metrics =
                await guildService.getGuildMetrics('111111111111111111')

            expect(metrics).toEqual({
                memberCount: null,
                categoryCount: null,
                textChannelCount: null,
                voiceChannelCount: null,
                roleCount: null,
            })
        })
    })

    describe('guild member context', () => {
        test('returns nickname and roles from bot client member cache', async () => {
            const guildId = '111111111111111111'
            const userId = '222222222222222222'
            const mockGuild = {
                id: guildId,
                members: {
                    fetch: jest.fn().mockResolvedValue({
                        nickname: 'Mod Nick',
                        roles: {
                            cache: new Map([
                                [guildId, { id: guildId }],
                                [
                                    '333333333333333333',
                                    { id: '333333333333333333' },
                                ],
                            ]),
                        },
                    }),
                },
            } as unknown as Guild

            setBotClient({
                guilds: {
                    cache: new Map([[guildId, mockGuild]]),
                    fetch: jest.fn(),
                },
            } as unknown as Client)

            const context = await guildService.getGuildMemberContext(
                guildId,
                userId,
            )

            expect(context).toEqual({
                nickname: 'Mod Nick',
                roleIds: ['333333333333333333'],
            })
        })

        test('falls back to API when bot client path fails', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            const guildId = '111111111111111111'
            const userId = '222222222222222222'

            setBotClient({
                guilds: {
                    cache: new Map(),
                    fetch: jest
                        .fn()
                        .mockRejectedValue(new Error('client fail')),
                },
            } as unknown as Client)

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    nick: 'Api Nick',
                    roles: ['444444444444444444'],
                }),
            } as never) as unknown as typeof fetch

            const context = await guildService.getGuildMemberContext(
                guildId,
                userId,
            )

            expect(context).toEqual({
                nickname: 'Api Nick',
                roleIds: ['444444444444444444'],
            })
        })

        test('returns fallback context when token is missing and API cannot be used', async () => {
            setBotClient(null)
            delete process.env.DISCORD_TOKEN

            const context = await guildService.getGuildMemberContext(
                '111111111111111111',
                '222222222222222222',
            )

            expect(context).toEqual({ nickname: null, roleIds: [] })
        })
    })

    describe('guild role options', () => {
        test('returns sorted role options from bot client', async () => {
            const guildId = '111111111111111111'
            const mockGuild = {
                id: guildId,
                roles: {
                    fetch: jest.fn().mockResolvedValue(
                        new Map([
                            [
                                guildId,
                                {
                                    id: guildId,
                                    name: '@everyone',
                                    position: 0,
                                    color: 0,
                                },
                            ],
                            [
                                '1',
                                {
                                    id: '1',
                                    name: 'Mods',
                                    position: 10,
                                    color: 255,
                                },
                            ],
                            [
                                '2',
                                {
                                    id: '2',
                                    name: 'Helpers',
                                    position: 2,
                                    color: 0,
                                },
                            ],
                        ]),
                    ),
                },
            } as unknown as Guild

            setBotClient({
                guilds: {
                    cache: new Map([[guildId, mockGuild]]),
                    fetch: jest.fn(),
                },
            } as unknown as Client)

            const roles = await guildService.getGuildRoleOptions(guildId)

            expect(roles).toEqual([
                { id: '1', name: 'Mods', color: 255, position: 10 },
                { id: '2', name: 'Helpers', color: 0, position: 2 },
            ])
        })

        test('falls back to Discord API for role options when client path fails', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            const guildId = '111111111111111111'

            setBotClient({
                guilds: {
                    cache: new Map(),
                    fetch: jest
                        .fn()
                        .mockRejectedValue(new Error('client fail')),
                },
            } as unknown as Client)

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => [
                    { id: '2', name: 'Helpers', position: 2, color: 0 },
                    { id: '1', name: 'Mods', position: 8, color: 128 },
                ],
            } as never) as unknown as typeof fetch

            const roles = await guildService.getGuildRoleOptions(guildId)

            expect(roles).toEqual([
                { id: '1', name: 'Mods', color: 128, position: 8 },
                { id: '2', name: 'Helpers', color: 0, position: 2 },
            ])
        })

        test('returns empty role options when API request fails', async () => {
            process.env.DISCORD_TOKEN = 'test-bot-token'
            setBotClient(null)
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
            } as never) as unknown as typeof fetch

            const roles =
                await guildService.getGuildRoleOptions('111111111111111111')

            expect(roles).toEqual([])
        })
    })
})
