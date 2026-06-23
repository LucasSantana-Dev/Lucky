import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import { guildService, setBotClient } from '../../../src/services/GuildService'
import type { Client, Guild, Role } from 'discord.js'

const originalFetch = global.fetch

describe('GuildService - Role Write Operations Error Handling', () => {
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

    describe('updateGuildRole', () => {
        test('should throw "Role not found" when role fetch returns null, without calling REST', async () => {
            const mockGuild = {
                id: '111111111111111111',
                roles: {
                    fetch: jest.fn().mockResolvedValue(null),
                },
            } as unknown as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const fetchMock = jest.fn()
            global.fetch = fetchMock as unknown as typeof fetch

            const updateData = {
                name: 'updated-role',
                color: 255,
                hoist: true,
                mentionable: true,
                permissions: '0',
            }

            // Should throw with "Role not found" message
            await expect(
                guildService.updateGuildRole(
                    '111111111111111111',
                    '999999999999999999',
                    updateData,
                ),
            ).rejects.toThrow('Role not found')

            // REST fetch should NOT be called
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('should propagate bot client role.edit errors without calling REST', async () => {
            const mockRole = {
                id: '999999999999999999',
                edit: jest
                    .fn()
                    .mockRejectedValue(new Error('Permission denied')),
            } as unknown as Role

            const mockGuild = {
                id: '111111111111111111',
                roles: {
                    fetch: jest.fn().mockResolvedValue(mockRole),
                },
            } as unknown as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const fetchMock = jest.fn()
            global.fetch = fetchMock as unknown as typeof fetch

            const updateData = {
                name: 'updated-role',
                color: 255,
                hoist: true,
                mentionable: true,
                permissions: '0',
            }

            // Should throw the bot client error
            await expect(
                guildService.updateGuildRole(
                    '111111111111111111',
                    '999999999999999999',
                    updateData,
                ),
            ).rejects.toThrow('Permission denied')

            // REST fetch should NOT be called
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('should fall back to REST when bot client is null', async () => {
            setBotClient(null)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const restRole = {
                id: '999999999999999999',
                name: 'updated-via-rest',
                color: 255,
                hoist: true,
                mentionable: true,
                permissions: '0',
                position: 1,
                managed: false,
            }

            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => restRole,
            } as never)
            global.fetch = fetchMock as unknown as typeof fetch

            const updateData = {
                name: 'updated-role',
                color: 255,
                hoist: true,
                mentionable: true,
                permissions: '0',
            }

            const result = await guildService.updateGuildRole(
                '111111111111111111',
                '999999999999999999',
                updateData,
            )

            expect(result.name).toBe('updated-via-rest')
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    '/guilds/111111111111111111/roles/999999999999999999',
                ),
                expect.objectContaining({ method: 'PATCH' }),
            )
        })
    })

    describe('deleteGuildRole', () => {
        test('should throw "Role not found" when role fetch returns null, without calling REST', async () => {
            const mockGuild = {
                id: '111111111111111111',
                roles: {
                    fetch: jest.fn().mockResolvedValue(null),
                },
            } as unknown as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const fetchMock = jest.fn()
            global.fetch = fetchMock as unknown as typeof fetch

            // Should throw with "Role not found" message
            await expect(
                guildService.deleteGuildRole(
                    '111111111111111111',
                    '999999999999999999',
                ),
            ).rejects.toThrow('Role not found')

            // REST fetch should NOT be called
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('should return void when role is successfully deleted via bot client', async () => {
            const mockRole = {
                id: '999999999999999999',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Role

            const mockGuild = {
                id: '111111111111111111',
                roles: {
                    fetch: jest.fn().mockResolvedValue(mockRole),
                },
            } as unknown as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const fetchMock = jest.fn()
            global.fetch = fetchMock as unknown as typeof fetch

            // Should resolve without error
            await expect(
                guildService.deleteGuildRole(
                    '111111111111111111',
                    '999999999999999999',
                ),
            ).resolves.toBeUndefined()

            // REST fetch should NOT be called
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('should fall back to REST when bot client is null', async () => {
            setBotClient(null)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
            } as never)
            global.fetch = fetchMock as unknown as typeof fetch

            // Should resolve without error
            await expect(
                guildService.deleteGuildRole(
                    '111111111111111111',
                    '999999999999999999',
                ),
            ).resolves.toBeUndefined()

            // REST fetch should be called
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    '/guilds/111111111111111111/roles/999999999999999999',
                ),
                expect.objectContaining({ method: 'DELETE' }),
            )
        })
    })

    describe('createGuildRole', () => {
        test('should propagate bot client roles.create errors without calling REST (no duplicate)', async () => {
            const mockGuild = {
                id: '111111111111111111',
                roles: {
                    create: jest
                        .fn()
                        .mockRejectedValue(new Error('Rate limited')),
                },
            } as unknown as Guild

            const mockClient = {
                guilds: {
                    cache: new Map([['111111111111111111', mockGuild]]),
                },
            } as unknown as Client

            setBotClient(mockClient)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const fetchMock = jest.fn()
            global.fetch = fetchMock as unknown as typeof fetch

            const createData = {
                name: 'new-role',
                color: 255,
                hoist: true,
                mentionable: true,
                permissions: '0',
            }

            // Should throw the bot client error
            await expect(
                guildService.createGuildRole('111111111111111111', createData),
            ).rejects.toThrow('Rate limited')

            // REST fetch should NOT be called
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('should fall back to REST when bot client is null', async () => {
            setBotClient(null)
            process.env.DISCORD_TOKEN = 'test-bot-token'

            const restRole = {
                id: '999999999999999999',
                name: 'created-via-rest',
                color: 255,
                hoist: true,
                mentionable: true,
                permissions: '0',
                position: 1,
                managed: false,
            }

            const fetchMock = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => restRole,
            } as never)
            global.fetch = fetchMock as unknown as typeof fetch

            const createData = {
                name: 'new-role',
                color: 255,
                hoist: true,
                mentionable: true,
                permissions: '0',
            }

            const result = await guildService.createGuildRole(
                '111111111111111111',
                createData,
            )

            expect(result.name).toBe('created-via-rest')
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/guilds/111111111111111111/roles'),
                expect.objectContaining({ method: 'POST' }),
            )
        })
    })
})
