import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => {
    const findMany = jest.fn()
    const settingsFindUnique = jest.fn()
    const settingsFindMany = jest.fn()
    return {
        infoLog: jest.fn(),
        debugLog: jest.fn(),
        errorLog: jest.fn(),
        getPrismaClient: () => ({
            memberBirthday: { findMany },
            guildSettings: {
                findUnique: settingsFindUnique,
                findMany: settingsFindMany,
            },
        }),
        __mocks: { findMany, settingsFindUnique, settingsFindMany },
    }
})

const { __mocks: dbMocks } = jest.requireMock('@lucky/shared/utils') as {
    __mocks: {
        findMany: jest.MockedFunction<(args?: unknown) => Promise<unknown>>
        settingsFindUnique: jest.MockedFunction<
            (args?: unknown) => Promise<unknown>
        >
        settingsFindMany: jest.MockedFunction<
            (args?: unknown) => Promise<unknown>
        >
    }
}

import { BirthdayScheduler } from './birthdayScheduler'

function makeClient(sentCapture: Array<{ channelId: string; payload: unknown }>) {
    const channelSend = (channelId: string) =>
        jest.fn((payload: unknown) => {
            sentCapture.push({ channelId, payload })
            return Promise.resolve(undefined)
        })
    return {
        channels: {
            fetch: jest.fn((id: string) =>
                Promise.resolve({
                    id,
                    type: 0, // ChannelType.GuildText === 0
                    send: channelSend(id),
                }),
            ),
        },
    }
}

beforeEach(() => {
    dbMocks.findMany.mockReset()
    dbMocks.settingsFindUnique.mockReset()
    dbMocks.settingsFindMany.mockReset().mockResolvedValue([])
})

function makeGuildWithRole(
    roleId: string,
    currentMembers: Map<string, { rolesCacheHas: (id: string) => boolean; rolesAdd: jest.Mock; rolesRemove: jest.Mock }>,
    roleMembers: Map<string, { rolesAdd: jest.Mock; rolesRemove: jest.Mock }>,
) {
    return {
        members: {
            fetch: jest.fn((id: string) => {
                const m = currentMembers.get(id)
                return Promise.resolve(
                    m
                        ? {
                              roles: {
                                  cache: { has: m.rolesCacheHas },
                                  add: m.rolesAdd,
                                  remove: m.rolesRemove,
                              },
                          }
                        : null,
                )
            }),
        },
        roles: {
            fetch: jest.fn((id: string) => {
                if (id !== roleId) return Promise.resolve(null)
                return Promise.resolve({
                    id: roleId,
                    members: roleMembers as unknown as Map<string, { roles: { remove: jest.Mock } }>,
                })
            }),
        },
    }
}

describe('BirthdayScheduler.tick', () => {
    test('no-ops when no birthdays match the date', async () => {
        dbMocks.findMany.mockResolvedValue([])
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const client = makeClient(sent) as never
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client // inject without start()
        await scheduler.tick()
        expect(sent).toHaveLength(0)
        expect(dbMocks.settingsFindUnique).not.toHaveBeenCalled()
    })

    test('announces to the configured channel for matching birthdays', async () => {
        dbMocks.findMany.mockResolvedValue([
            { guildId: 'g1', userId: 'u1' },
            { guildId: 'g1', userId: 'u2' },
        ])
        dbMocks.settingsFindUnique.mockResolvedValue({
            birthdayChannelId: 'chan-1',
        })
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const client = makeClient(sent) as never
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client
        await scheduler.tick()
        expect(sent).toHaveLength(1)
        expect(sent[0].channelId).toBe('chan-1')
        const payload = sent[0].payload as {
            content: string
            embeds: Array<{ description: string }>
        }
        expect(payload.content).toContain('<@u1>')
        expect(payload.content).toContain('<@u2>')
    })

    test('skips guilds without a configured channel', async () => {
        dbMocks.findMany.mockResolvedValue([
            { guildId: 'g-noconfig', userId: 'u1' },
        ])
        dbMocks.settingsFindUnique.mockResolvedValue({
            birthdayChannelId: null,
        })
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const client = makeClient(sent) as never
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client
        await scheduler.tick()
        expect(sent).toHaveLength(0)
    })

    test('is idempotent within the same UTC day', async () => {
        dbMocks.findMany.mockResolvedValue([{ guildId: 'g1', userId: 'u1' }])
        dbMocks.settingsFindUnique.mockResolvedValue({
            birthdayChannelId: 'chan-1',
        })
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const client = makeClient(sent) as never
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client
        await scheduler.tick()
        await scheduler.tick()
        expect(sent).toHaveLength(1)
    })

    test('posts again when the UTC date rolls over', async () => {
        dbMocks.findMany.mockResolvedValue([{ guildId: 'g1', userId: 'u1' }])
        dbMocks.settingsFindUnique.mockResolvedValue({
            birthdayChannelId: 'chan-1',
        })
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const client = makeClient(sent) as never
        let currentDate = new Date('2026-04-20T23:30:00Z')
        const scheduler = new BirthdayScheduler({ clock: () => currentDate })
        scheduler['client'] = client
        await scheduler.tick()
        // roll over to next day
        currentDate = new Date('2026-04-21T00:30:00Z')
        await scheduler.tick()
        expect(sent).toHaveLength(2)
    })

    test('grants birthday role to today\'s celebrators', async () => {
        dbMocks.findMany.mockResolvedValue([{ guildId: 'g1', userId: 'u1' }])
        dbMocks.settingsFindUnique.mockResolvedValue({
            birthdayChannelId: 'chan-1',
            birthdayRoleId: 'role-1',
        })
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const rolesAdd = jest.fn(() => Promise.resolve())
        const rolesRemove = jest.fn(() => Promise.resolve())
        const member = {
            rolesCacheHas: (_id: string) => false,
            rolesAdd,
            rolesRemove,
        }
        const currentMembers = new Map([['u1', member]])
        const guildWithRole = makeGuildWithRole('role-1', currentMembers, new Map())
        const client = {
            ...makeClient(sent),
            guilds: { fetch: jest.fn(() => Promise.resolve(guildWithRole)) },
        } as unknown
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client as never
        await scheduler.tick()
        expect(rolesAdd).toHaveBeenCalledWith('role-1', expect.any(String))
    })

    test('revokes birthday role from stale holders whose birthday is not today', async () => {
        // No birthdays today in guild g2, but someone still holds the role
        dbMocks.findMany.mockResolvedValue([])
        dbMocks.settingsFindMany.mockResolvedValueOnce([
            { guildId: 'g2', birthdayRoleId: 'role-2' },
        ])
        dbMocks.settingsFindUnique.mockResolvedValue({
            birthdayChannelId: null,
            birthdayRoleId: 'role-2',
        })
        const revokeSpy = jest.fn(() => Promise.resolve())
        const staleHolder = {
            roles: { remove: revokeSpy },
        }
        const roleMembers = new Map([['stale-user', staleHolder]])
        const guildWithRole = makeGuildWithRole(
            'role-2',
            new Map(),
            roleMembers as never,
        )
        const client = {
            channels: { fetch: jest.fn() },
            guilds: { fetch: jest.fn(() => Promise.resolve(guildWithRole)) },
        } as unknown
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client as never
        await scheduler.tick()
        expect(revokeSpy).toHaveBeenCalledWith('role-2', expect.any(String))
    })

    test('does not re-grant a role a member already has', async () => {
        dbMocks.findMany.mockResolvedValue([{ guildId: 'g1', userId: 'u1' }])
        dbMocks.settingsFindUnique.mockResolvedValue({
            birthdayChannelId: 'chan-1',
            birthdayRoleId: 'role-1',
        })
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const rolesAdd = jest.fn(() => Promise.resolve())
        const member = {
            rolesCacheHas: (id: string) => id === 'role-1', // already has it
            rolesAdd,
            rolesRemove: jest.fn(),
        }
        const currentMembers = new Map([['u1', member]])
        const u1AsRoleMember = { roles: { remove: jest.fn() } }
        const roleMembers = new Map([['u1', u1AsRoleMember]])
        const guildWithRole = makeGuildWithRole(
            'role-1',
            currentMembers,
            roleMembers as never,
        )
        const client = {
            ...makeClient(sent),
            guilds: { fetch: jest.fn(() => Promise.resolve(guildWithRole)) },
        } as unknown
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client as never
        await scheduler.tick()
        expect(rolesAdd).not.toHaveBeenCalled()
        expect(u1AsRoleMember.roles.remove).not.toHaveBeenCalled()
    })

    test('continues after a db error', async () => {
        dbMocks.findMany.mockRejectedValue(new Error('db down'))
        const sent: Array<{ channelId: string; payload: unknown }> = []
        const client = makeClient(sent) as never
        const scheduler = new BirthdayScheduler({
            clock: () => new Date('2026-04-20T00:00:00Z'),
        })
        scheduler['client'] = client
        // should not throw
        await expect(scheduler.tick()).resolves.toBeUndefined()
        expect(sent).toHaveLength(0)
    })
})
