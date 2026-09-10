import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import type { Client, Guild, GuildMember, Role } from 'discord.js'

// Define all mocks before jest.mock calls
const debugLogMock = jest.fn()
const infoLogMock = jest.fn()
const warnLogMock = jest.fn()
const errorLogMock = jest.fn()

const getTwitchFollowerConfigMock = jest.fn()
const getTwitchFollowerLinksForGuildMock = jest.fn()
const updateFollowerStatusMock = jest.fn()
const getTwitchSubscriberConfigMock = jest.fn()
const getAllConfigsMock = jest.fn()

const getTwitchEnvMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: debugLogMock,
    infoLog: infoLogMock,
    warnLog: warnLogMock,
    errorLog: errorLogMock,
}))

jest.mock('@lucky/shared/services', () => ({
    twitchFollowerRoleService: {
        getConfig: getTwitchFollowerConfigMock,
        getLinksForGuild: getTwitchFollowerLinksForGuildMock,
        updateFollowerStatus: updateFollowerStatusMock,
        getAllConfigs: getAllConfigsMock,
    },
    twitchSubscriberRoleService: {
        getConfig: getTwitchSubscriberConfigMock,
    },
}))

jest.mock('./token', () => ({
    getTwitchEnv: getTwitchEnvMock,
}))

import {
    syncGuildFollowerRoles,
    syncAllGuildFollowerRoles,
    assignFollowerRole,
} from './followerRoleSync'

describe('followerRoleSync', () => {
    let fetchSpy: jest.SpyInstance
    let mockGuild: Partial<Guild>
    let mockRole: Partial<Role>
    let mockMember: Partial<GuildMember>
    let mockClient: Partial<Client>

    beforeEach(() => {
        jest.clearAllMocks()
        // A default response, so a test that reaches checkTwitchFollow without
        // setting its own mock cannot make a real request to api.twitch.tv.
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
                total: 1,
            }),
        } as unknown as Response)

        // Mock role
        mockRole = {
            id: 'role-123',
        }

        // Mock member
        mockMember = {
            id: 'user-123',
            roles: {
                cache: new Map([['role-123', mockRole]]),
                add: jest.fn(),
                remove: jest.fn(),
            } as any,
        }

        // Mock guild
        mockGuild = {
            id: 'guild-123',
            members: {
                fetch: jest.fn().mockResolvedValue(mockMember),
            } as any,
            roles: {
                cache: new Map([['role-123', mockRole]]),
            } as any,
        }

        // Mock client
        mockClient = {
            guilds: {
                cache: new Map([['guild-123', mockGuild]]),
            } as any,
        }

        getTwitchEnvMock.mockReturnValue({
            clientId: 'test-client-id',
            accessToken: 'test-access-token',
        })
    })

    afterEach(() => {
        fetchSpy.mockRestore()
    })

    describe('syncGuildFollowerRoles', () => {
        it('returns zero if no follower or subscriber config', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue(null)
            getTwitchSubscriberConfigMock.mockResolvedValue(null)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 0, errors: 0 })
        })

        it('returns zero if config exists but Twitch env missing', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchEnvMock.mockReturnValue({
                clientId: null,
                accessToken: null,
            })

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 0, errors: 0 })
        })

        it('returns zero if no links found for guild', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([])

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 0, errors: 0 })
        })

        it('returns zero if guild not found in cache', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                { discordUserId: 'user-123', twitchUserId: 'twitch-123' },
            ])

            const emptyClient = {
                guilds: {
                    cache: new Map(),
                } as any,
            }

            const result = await syncGuildFollowerRoles(
                'guild-456',
                emptyClient as Client,
            )

            expect(result).toEqual({ updated: 0, errors: 0 })
        })

        it('grants role when follower is present and does not already have role', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-123',
                    twitchUserId: 'twitch-123',
                    isSubscriber: false,
                },
            ])

            mockMember!.roles!.cache = new Map() // No role initially

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ total: 1 }),
            } as any)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 1, errors: 0 })
            expect(mockMember.roles!.add).toHaveBeenCalledWith(mockRole)
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Added follower role to user-123',
                    ),
                }),
            )
        })

        it('does not re-grant role if follower already has it', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-123',
                    twitchUserId: 'twitch-123',
                    isSubscriber: false,
                },
            ])

            mockMember!.roles!.cache = new Map([['role-123', mockRole]]) // Already has role

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ total: 1 }),
            } as any)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 0, errors: 0 })
            expect(mockMember.roles!.add).not.toHaveBeenCalled()
        })

        it('removes role when follower absent and member has role', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-123',
                    twitchUserId: 'twitch-123',
                    isSubscriber: false,
                },
            ])

            mockMember!.roles!.cache = new Map([['role-123', mockRole]]) // Has role

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ total: 0 }),
            } as any)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 1, errors: 0 })
            expect(mockMember.roles!.remove).toHaveBeenCalledWith(mockRole)
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Removed follower role from user-123',
                    ),
                }),
            )
        })

        it('does not add role if member fetch fails', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-missing',
                    twitchUserId: 'twitch-123',
                    isSubscriber: false,
                },
            ])

            ;(mockGuild.members!.fetch as jest.Mock).mockRejectedValueOnce(
                new Error('Member not found'),
            )

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ total: 1 }),
            } as any)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 0, errors: 0 })
            expect(mockMember.roles!.add).not.toHaveBeenCalled()
        })

        it('does not modify if role not found in guild', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-missing',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-123',
                    twitchUserId: 'twitch-123',
                    isSubscriber: false,
                },
            ])

            mockGuild!.roles!.cache = new Map() // Role not in guild

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ total: 1 }),
            } as any)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 0, errors: 0 })
            expect(mockMember.roles!.add).not.toHaveBeenCalled()
        })

        it('continues processing after API failure and logs warning', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-1',
                    twitchUserId: 'twitch-1',
                    isSubscriber: false,
                },
                {
                    discordUserId: 'user-2',
                    twitchUserId: 'twitch-2',
                    isSubscriber: false,
                },
            ])

            mockMember!.roles!.cache = new Map()

            const user2Member = {
                id: 'user-2',
                roles: {
                    cache: new Map(),
                    add: jest.fn(),
                    remove: jest.fn(),
                },
            } as any

            ;(mockGuild.members!.fetch as jest.Mock)
                .mockResolvedValueOnce(mockMember)
                .mockResolvedValueOnce(user2Member)

            // First request returns 500 error
            fetchSpy
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                } as any)
                // Second request succeeds
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ total: 1 }),
                } as any)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 1, errors: 0 })
            expect(user2Member.roles.add).toHaveBeenCalledWith(mockRole)
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Twitch follow check failed',
                    ),
                    data: expect.objectContaining({
                        count: 1,
                        firstStatus: 500,
                    }),
                }),
            )
        })

        it('continues loop on member.roles.add error', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-1',
                    twitchUserId: 'twitch-1',
                    isSubscriber: false,
                },
                {
                    discordUserId: 'user-2',
                    twitchUserId: 'twitch-2',
                    isSubscriber: false,
                },
            ])

            const failingMember = {
                id: 'user-1',
                roles: {
                    cache: new Map(),
                    add: jest
                        .fn()
                        .mockRejectedValueOnce(new Error('Permission denied')),
                    remove: jest.fn(),
                },
            } as any

            const succeedingMember = {
                id: 'user-2',
                roles: {
                    cache: new Map(),
                    add: jest.fn().mockResolvedValueOnce(undefined),
                    remove: jest.fn(),
                },
            } as any

            ;(mockGuild.members!.fetch as jest.Mock)
                .mockResolvedValueOnce(failingMember)
                .mockResolvedValueOnce(succeedingMember)

            fetchSpy
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ total: 1 }),
                } as any)
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ total: 1 }),
                } as any)

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 1, errors: 1 })
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('error processing user-1'),
                }),
            )
            expect(succeedingMember.roles.add).toHaveBeenCalledWith(mockRole)
        })

        it('handles subscriber role grant when subscriber config present', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue(null)
            getTwitchSubscriberConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'sub-role-123',
            })
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-123',
                    twitchUserId: 'twitch-123',
                    isSubscriber: true,
                },
            ])

            const subRole = { id: 'sub-role-123' }
            mockMember!.roles!.cache = new Map()
            mockGuild!.roles!.cache = new Map([
                ['sub-role-123', subRole as any],
            ])

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 1, errors: 0 })
            expect(mockMember.roles!.add).toHaveBeenCalledWith(subRole)
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Added subscriber role to user-123',
                    ),
                }),
            )
        })

        it('removes subscriber role when isSubscriber is false and member has role', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue(null)
            getTwitchSubscriberConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'sub-role-123',
            })
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-123',
                    twitchUserId: 'twitch-123',
                    isSubscriber: false,
                },
            ])

            const subRole = { id: 'sub-role-123' }
            mockMember!.roles!.cache = new Map([
                ['sub-role-123', subRole as any],
            ])
            mockGuild!.roles!.cache = new Map([
                ['sub-role-123', subRole as any],
            ])

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result).toEqual({ updated: 1, errors: 0 })
            expect(mockMember.roles!.remove).toHaveBeenCalledWith(subRole)
        })

        it('increments error counter when catch block triggered', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                twitchBroadcasterId: 'broadcaster-123',
                discordRoleId: 'role-123',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([
                {
                    discordUserId: 'user-123',
                    twitchUserId: 'twitch-123',
                    isSubscriber: false,
                },
            ])

            ;(mockGuild.members!.fetch as jest.Mock).mockImplementation(() => {
                throw new Error('Unexpected error')
            })

            const result = await syncGuildFollowerRoles(
                'guild-123',
                mockClient as Client,
            )

            expect(result.errors).toBe(1)
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('syncAllGuildFollowerRoles', () => {
        it('does nothing if no configs exist', async () => {
            getAllConfigsMock.mockResolvedValue([])

            await syncAllGuildFollowerRoles(mockClient as Client)

            expect(infoLogMock).not.toHaveBeenCalled()
        })

        it('syncs all guilds with configs', async () => {
            getAllConfigsMock.mockResolvedValue([
                {
                    guildId: 'guild-1',
                    twitchBroadcasterId: 'broadcaster-1',
                    discordRoleId: 'role-1',
                },
                {
                    guildId: 'guild-2',
                    twitchBroadcasterId: 'broadcaster-2',
                    discordRoleId: 'role-2',
                },
            ])

            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-1',
                twitchBroadcasterId: 'broadcaster-1',
                discordRoleId: 'role-1',
            })
            getTwitchSubscriberConfigMock.mockResolvedValue(null)
            getTwitchFollowerLinksForGuildMock.mockResolvedValue([])

            await syncAllGuildFollowerRoles(mockClient as Client)

            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('syncing 2 guild(s)'),
                }),
            )
        })
    })

    describe('assignFollowerRole', () => {
        it('returns false if config does not exist', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue(null)

            const result = await assignFollowerRole(
                'user-123',
                'guild-123',
                mockClient as Client,
            )

            expect(result).toBe(false)
        })

        it('returns false if guild not found', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'role-123',
            })

            const emptyClient = {
                guilds: {
                    cache: new Map(),
                } as any,
            }

            const result = await assignFollowerRole(
                'user-123',
                'guild-456',
                emptyClient as Client,
            )

            expect(result).toBe(false)
        })

        it('returns false if member not found', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'role-123',
            })

            ;(mockGuild.members!.fetch as jest.Mock).mockRejectedValueOnce(
                new Error('Member not found'),
            )

            const result = await assignFollowerRole(
                'user-missing',
                'guild-123',
                mockClient as Client,
            )

            expect(result).toBe(false)
        })

        it('returns false if role not found', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'role-missing',
            })

            mockGuild!.roles!.cache = new Map()

            const result = await assignFollowerRole(
                'user-123',
                'guild-123',
                mockClient as Client,
            )

            expect(result).toBe(false)
        })

        it('assigns role if member does not have it', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'role-123',
            })

            mockMember!.roles!.cache = new Map()

            const result = await assignFollowerRole(
                'user-123',
                'guild-123',
                mockClient as Client,
            )

            expect(result).toBe(true)
            expect(mockMember.roles!.add).toHaveBeenCalledWith(mockRole)
        })

        it('does not re-assign if member already has role', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'role-123',
            })

            mockMember!.roles!.cache = new Map([['role-123', mockRole]])

            const result = await assignFollowerRole(
                'user-123',
                'guild-123',
                mockClient as Client,
            )

            expect(result).toBe(true)
            expect(mockMember.roles!.add).not.toHaveBeenCalled()
        })

        it('returns false and logs error if add fails', async () => {
            getTwitchFollowerConfigMock.mockResolvedValue({
                guildId: 'guild-123',
                discordRoleId: 'role-123',
            })

            mockMember!.roles!.cache = new Map()
            ;(mockMember.roles!.add as jest.Mock).mockRejectedValueOnce(
                new Error('Permission denied'),
            )

            const result = await assignFollowerRole(
                'user-123',
                'guild-123',
                mockClient as Client,
            )

            expect(result).toBe(false)
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'assignFollowerRole: failed for user-123',
                    ),
                }),
            )
        })
    })
})
