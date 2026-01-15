import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { guildService, setBotClient } from '../../../src/services/GuildService'
import { discordOAuthService } from '../../../src/services/DiscordOAuthService'
import {
    MOCK_DISCORD_GUILDS,
    MOCK_TOKEN_RESPONSE,
} from '../../fixtures/mock-data'
import type { Client, Guild } from 'discord.js'

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        getUserGuilds: jest.fn(),
        filterAdminGuilds: jest.fn(),
    },
}))

describe('GuildService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        setBotClient(null)
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

    describe('getGuildDetails', () => {
        test('should return guild details when bot is in guild', async () => {
            const mockGuild = {
                id: '111111111111111111',
                name: 'Test Server',
                icon: 'test_icon',
                features: ['COMMUNITY'],
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
})
