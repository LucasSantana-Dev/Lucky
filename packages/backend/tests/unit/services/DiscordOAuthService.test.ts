import { describe, test, expect, beforeEach, jest } from '@jest/globals'

jest.mock('@lucky/shared/utils/alerts', () => ({
    recordWithCooldown: jest.fn().mockReturnValue(false),
    emitAlert: jest.fn().mockImplementation(async () => {}),
}))

import { discordOAuthService } from '../../../src/services/DiscordOAuthService'
import { recordWithCooldown, emitAlert } from '@lucky/shared/utils/alerts'
import {
    MOCK_TOKEN_RESPONSE,
    MOCK_DISCORD_USER,
    MOCK_DISCORD_GUILDS,
    MOCK_AUTH_CODE,
} from '../../fixtures/mock-data'

describe('DiscordOAuthService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('exchangeCodeForToken', () => {
        test('should exchange code for token successfully', async () => {
            const mockResponse = {
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue(MOCK_TOKEN_RESPONSE),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            const result =
                await discordOAuthService.exchangeCodeForToken(MOCK_AUTH_CODE)

            expect(result).toEqual(MOCK_TOKEN_RESPONSE)
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/oauth2/token'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/x-www-form-urlencoded',
                    }),
                }),
            )
        })

        test('should throw error when token exchange fails', async () => {
            const mockResponse = {
                ok: false,
                status: 400,
                text: jest
                    .fn<() => Promise<string>>()
                    .mockResolvedValue('Invalid code'),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.exchangeCodeForToken(MOCK_AUTH_CODE),
            ).rejects.toThrow()
        })

        test('should throw error on network failure', async () => {
            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockRejectedValue(new Error('Network error'))
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.exchangeCodeForToken(MOCK_AUTH_CODE),
            ).rejects.toThrow('Network error')
        })

        test('should throw when token response is missing required fields', async () => {
            const mockResponse = {
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue({ token_type: 'Bearer' }),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.exchangeCodeForToken(MOCK_AUTH_CODE),
            ).rejects.toThrow(/Invalid token response/)
        })
    })

    describe('getUserInfo', () => {
        test('should fetch user info successfully', async () => {
            const mockResponse = {
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue(MOCK_DISCORD_USER),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            const result = await discordOAuthService.getUserInfo(
                MOCK_TOKEN_RESPONSE.access_token,
            )

            expect(result).toEqual(MOCK_DISCORD_USER)
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/users/@me'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${MOCK_TOKEN_RESPONSE.access_token}`,
                    }),
                }),
            )
        })

        test('should throw error when user info fetch fails', async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                text: jest
                    .fn<() => Promise<string>>()
                    .mockResolvedValue('Unauthorized'),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.getUserInfo(
                    MOCK_TOKEN_RESPONSE.access_token,
                ),
            ).rejects.toThrow()
        })

        test('should throw when user response is missing required fields', async () => {
            const mockResponse = {
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue({ username: 'nouserid' }),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.getUserInfo(
                    MOCK_TOKEN_RESPONSE.access_token,
                ),
            ).rejects.toThrow(/Invalid user response/)
        })
    })

    describe('getUserGuilds', () => {
        test('should fetch user guilds successfully', async () => {
            const mockResponse = {
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue(MOCK_DISCORD_GUILDS),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            const result = await discordOAuthService.getUserGuilds(
                MOCK_TOKEN_RESPONSE.access_token,
            )

            expect(result).toEqual(MOCK_DISCORD_GUILDS)
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/users/@me/guilds'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${MOCK_TOKEN_RESPONSE.access_token}`,
                    }),
                }),
            )
        })

        test('retries once on a 429 honouring Retry-After, then succeeds', async () => {
            const rateLimited = {
                ok: false,
                status: 429,
                headers: {
                    get: (key: string) =>
                        key.toLowerCase() === 'retry-after' ? '0.01' : null,
                },
                text: jest
                    .fn<() => Promise<string>>()
                    .mockResolvedValue('rate limited'),
            } as unknown as Response
            const success = {
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue(MOCK_DISCORD_GUILDS),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch
                .mockResolvedValueOnce(rateLimited)
                .mockResolvedValueOnce(success)
            global.fetch = mockFetch as typeof fetch

            const result = await discordOAuthService.getUserGuilds(
                MOCK_TOKEN_RESPONSE.access_token,
            )

            expect(result).toEqual(MOCK_DISCORD_GUILDS)
            expect(mockFetch).toHaveBeenCalledTimes(2)
        })

        test('throws after the 429 retry is exhausted', async () => {
            const rateLimited = {
                ok: false,
                status: 429,
                headers: {
                    get: (key: string) =>
                        key.toLowerCase() === 'retry-after' ? '0.01' : null,
                },
                text: jest
                    .fn<() => Promise<string>>()
                    .mockResolvedValue('rate limited'),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(rateLimited)
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.getUserGuilds(
                    MOCK_TOKEN_RESPONSE.access_token,
                ),
            ).rejects.toThrow('429')
            expect(mockFetch).toHaveBeenCalledTimes(2)
        })

        test('should throw error when guilds fetch fails', async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                text: jest
                    .fn<() => Promise<string>>()
                    .mockResolvedValue('Unauthorized'),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.getUserGuilds(
                    MOCK_TOKEN_RESPONSE.access_token,
                ),
            ).rejects.toThrow()
        })

        test('fires cascade alert when recordWithCooldown threshold is crossed on 429', async () => {
            ;(recordWithCooldown as jest.Mock).mockReturnValue(true)
            const rateLimited = {
                ok: false,
                status: 429,
                headers: {
                    get: (key: string) =>
                        key.toLowerCase() === 'retry-after' ? '0.01' : null,
                },
                text: jest
                    .fn<() => Promise<string>>()
                    .mockResolvedValue('rate limited'),
            } as unknown as Response
            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce({
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue(MOCK_DISCORD_GUILDS),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response)
            global.fetch = mockFetch as typeof fetch

            await discordOAuthService.getUserGuilds(
                MOCK_TOKEN_RESPONSE.access_token,
            )

            expect(emitAlert).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: '🚨 Discord API 429 cascade',
                }),
            )
        })
    })

    describe('refreshToken', () => {
        test('should refresh token successfully', async () => {
            const mockResponse = {
                ok: true,
                json: jest
                    .fn<() => Promise<any>>()
                    .mockResolvedValue(MOCK_TOKEN_RESPONSE),
                text: jest.fn<() => Promise<string>>(),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            const result = await discordOAuthService.refreshToken(
                MOCK_TOKEN_RESPONSE.refresh_token,
            )

            expect(result).toEqual(MOCK_TOKEN_RESPONSE)
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/oauth2/token'),
                expect.objectContaining({
                    method: 'POST',
                }),
            )
        })

        test('should throw error when token refresh fails', async () => {
            const mockResponse = {
                ok: false,
                status: 400,
                text: jest
                    .fn<() => Promise<string>>()
                    .mockResolvedValue('Invalid refresh token'),
            } as unknown as Response

            const mockFetch = jest.fn<typeof fetch>()
            mockFetch.mockResolvedValue(mockResponse)
            global.fetch = mockFetch as typeof fetch

            await expect(
                discordOAuthService.refreshToken(
                    MOCK_TOKEN_RESPONSE.refresh_token,
                ),
            ).rejects.toThrow()
        })
    })

    describe('hasAdminPermission', () => {
        test('should return true for administrator permission', () => {
            const permissions = '8'
            expect(discordOAuthService.hasAdminPermission(permissions)).toBe(
                true,
            )
        })

        test('should return true for manage guild permission', () => {
            const permissions = '32'
            expect(discordOAuthService.hasAdminPermission(permissions)).toBe(
                true,
            )
        })

        test('should return false for insufficient permissions', () => {
            const permissions = '1'
            expect(discordOAuthService.hasAdminPermission(permissions)).toBe(
                false,
            )
        })

        test('should return true for combined permissions', () => {
            const permissions = '40'
            expect(discordOAuthService.hasAdminPermission(permissions)).toBe(
                true,
            )
        })

        test('should return false when permission payload is invalid', () => {
            expect(discordOAuthService.hasAdminPermission('not-a-number')).toBe(
                false,
            )
        })
    })

    describe('filterAdminGuilds', () => {
        test('should filter guilds with admin permissions', () => {
            const guilds = [
                { ...MOCK_DISCORD_GUILDS[0], permissions: '8' },
                { ...MOCK_DISCORD_GUILDS[1], permissions: '1' },
            ]

            const result = discordOAuthService.filterAdminGuilds(guilds)

            expect(result).toHaveLength(1)
            expect(result[0].permissions).toBe('8')
        })

        test('should return empty array when no admin guilds', () => {
            const guilds = [
                { ...MOCK_DISCORD_GUILDS[0], permissions: '1' },
                { ...MOCK_DISCORD_GUILDS[1], permissions: '2' },
            ]

            const result = discordOAuthService.filterAdminGuilds(guilds)

            expect(result).toHaveLength(0)
        })

        test('should return all guilds when all have admin permissions', () => {
            const guilds = [
                { ...MOCK_DISCORD_GUILDS[0], permissions: '8' },
                { ...MOCK_DISCORD_GUILDS[1], permissions: '32' },
            ]

            const result = discordOAuthService.filterAdminGuilds(guilds)

            expect(result).toHaveLength(2)
        })

        test('should use permissions_new when permissions is stale', () => {
            const guilds = [
                {
                    ...MOCK_DISCORD_GUILDS[0],
                    permissions: '0',
                    permissions_new: '32',
                } as (typeof MOCK_DISCORD_GUILDS)[number] & {
                    permissions_new: string
                },
            ]

            const result = discordOAuthService.filterAdminGuilds(guilds)

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe(MOCK_DISCORD_GUILDS[0].id)
        })
    })
})
