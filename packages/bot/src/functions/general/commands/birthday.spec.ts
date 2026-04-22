import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => {
    const upsert = jest.fn()
    const deleteMany = jest.fn()
    const findMany = jest.fn()
    const settingsUpsert = jest.fn()
    return {
        infoLog: jest.fn(),
        debugLog: jest.fn(),
        errorLog: jest.fn(),
        getPrismaClient: () => ({
            memberBirthday: { upsert, deleteMany, findMany },
            guildSettings: { upsert: settingsUpsert },
        }),
        __mocks: { upsert, deleteMany, findMany, settingsUpsert },
    }
})

jest.mock('../../../utils/general/interactionReply.js', () => {
    const interactionReply = jest.fn()
    return { interactionReply, __mocks: { interactionReply } }
})

const { __mocks: utilsMocks } = jest.requireMock('@lucky/shared/utils') as {
    __mocks: {
        upsert: jest.MockedFunction<(args: unknown) => Promise<unknown>>
        deleteMany: jest.MockedFunction<
            (args: unknown) => Promise<{ count: number }>
        >
        findMany: jest.MockedFunction<(args: unknown) => Promise<unknown>>
        settingsUpsert: jest.MockedFunction<(args: unknown) => Promise<unknown>>
    }
}
const { __mocks: replyMocks } = jest.requireMock(
    '../../../utils/general/interactionReply.js',
) as {
    __mocks: {
        interactionReply: jest.MockedFunction<
            (args: { interaction: unknown; content: unknown }) => Promise<void>
        >
    }
}
const memberBirthdayUpsert = utilsMocks.upsert
const memberBirthdayDeleteMany = utilsMocks.deleteMany
const memberBirthdayFindMany = utilsMocks.findMany
const guildSettingsUpsert = utilsMocks.settingsUpsert
const interactionReply = replyMocks.interactionReply

import birthdayCommand, { daysUntilBirthday } from './birthday.js'

function makeInteraction(
    subcommand: string,
    values: { month?: number; day?: number } = {},
    withGuild = true,
) {
    return {
        guild: withGuild ? { id: 'guild-1' } : null,
        user: { id: 'u1', tag: 'alice#0' },
        options: {
            getSubcommand: () => subcommand,
            getInteger: (name: string) => {
                if (name === 'month') return values.month ?? null
                if (name === 'day') return values.day ?? null
                return null
            },
        },
    }
}

beforeEach(() => {
    memberBirthdayUpsert.mockReset().mockResolvedValue({})
    memberBirthdayDeleteMany.mockReset().mockResolvedValue({ count: 1 })
    memberBirthdayFindMany.mockReset().mockResolvedValue([])
    guildSettingsUpsert.mockReset().mockResolvedValue({})
    interactionReply.mockClear().mockResolvedValue(undefined)
})

describe('daysUntilBirthday', () => {
    test('today returns 0', () => {
        const d = new Date(Date.UTC(2026, 3, 20))
        expect(daysUntilBirthday(d, 4, 20)).toBe(0)
    })
    test('tomorrow returns 1', () => {
        const d = new Date(Date.UTC(2026, 3, 20))
        expect(daysUntilBirthday(d, 4, 21)).toBe(1)
    })
    test('past date rolls to next year', () => {
        const d = new Date(Date.UTC(2026, 3, 20))
        const days = daysUntilBirthday(d, 4, 19)
        // April has 30 days, so 20 → next April 19 is 364 days
        expect(days).toBeGreaterThan(300)
        expect(days).toBeLessThan(366)
    })
})

describe('/birthday', () => {
    test('rejects when used in DMs', async () => {
        await birthdayCommand.execute({
            interaction: makeInteraction('set', { month: 3, day: 15 }, false) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('server')
        expect(memberBirthdayUpsert).not.toHaveBeenCalled()
    })

    test('rejects invalid month', async () => {
        await birthdayCommand.execute({
            interaction: makeInteraction('set', { month: 13, day: 1 }) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Month')
        expect(memberBirthdayUpsert).not.toHaveBeenCalled()
    })

    test('rejects Feb 30', async () => {
        await birthdayCommand.execute({
            interaction: makeInteraction('set', { month: 2, day: 30 }) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('February')
        expect(memberBirthdayUpsert).not.toHaveBeenCalled()
    })

    test('accepts Feb 29 (leap-day tolerant)', async () => {
        await birthdayCommand.execute({
            interaction: makeInteraction('set', { month: 2, day: 29 }) as never,
        })
        expect(memberBirthdayUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ month: 2, day: 29 }),
            }),
        )
    })

    test('persists a valid birthday via upsert', async () => {
        await birthdayCommand.execute({
            interaction: makeInteraction('set', { month: 3, day: 15 }) as never,
        })
        expect(memberBirthdayUpsert).toHaveBeenCalledTimes(1)
        const call = memberBirthdayUpsert.mock.calls[0][0] as {
            where: { guildId_userId: { guildId: string; userId: string } }
            create: { month: number; day: number }
            update: { month: number; day: number }
        }
        expect(call.where.guildId_userId).toEqual({
            guildId: 'guild-1',
            userId: 'u1',
        })
        expect(call.create).toEqual({
            guildId: 'guild-1',
            userId: 'u1',
            month: 3,
            day: 15,
        })
        expect(call.update).toEqual({ month: 3, day: 15 })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        expect(args.content.embeds[0].description).toContain('March 15')
    })

    test('clear removes the birthday', async () => {
        await birthdayCommand.execute({
            interaction: makeInteraction('clear') as never,
        })
        expect(memberBirthdayDeleteMany).toHaveBeenCalledWith({
            where: { guildId: 'guild-1', userId: 'u1' },
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('removed')
    })

    test('clear is idempotent when no birthday set', async () => {
        memberBirthdayDeleteMany.mockResolvedValueOnce({ count: 0 })
        await birthdayCommand.execute({
            interaction: makeInteraction('clear') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('No birthday')
    })

    test('list shows empty state when no birthdays set', async () => {
        memberBirthdayFindMany.mockResolvedValueOnce([])
        await birthdayCommand.execute({
            interaction: {
                ...makeInteraction('list'),
                guild: { id: 'guild-1', name: 'TestGuild' },
            } as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('No birthdays')
    })

    test('list sorts by upcoming and caps at 5', async () => {
        memberBirthdayFindMany.mockResolvedValueOnce([
            { userId: 'a', month: 12, day: 25 },
            { userId: 'b', month: 1, day: 1 },
            { userId: 'c', month: 7, day: 4 },
            { userId: 'd', month: 3, day: 15 },
            { userId: 'e', month: 6, day: 10 },
            { userId: 'f', month: 11, day: 11 },
            { userId: 'g', month: 2, day: 2 },
        ])
        await birthdayCommand.execute({
            interaction: {
                ...makeInteraction('list'),
                guild: { id: 'guild-1', name: 'TestGuild' },
            } as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string; footer: { text: string } }> }
        }
        const description = args.content.embeds[0].description
        // Should show exactly 5 bullet lines
        expect(description.split('\n').length).toBe(5)
        expect(args.content.embeds[0].footer.text).toContain('5 of 7')
    })

    test('list labels same-day match as "today"', async () => {
        const now = new Date()
        const todayMonth = now.getUTCMonth() + 1
        const todayDay = now.getUTCDate()
        memberBirthdayFindMany.mockResolvedValueOnce([
            { userId: 'birthday-user', month: todayMonth, day: todayDay },
        ])
        await birthdayCommand.execute({
            interaction: {
                ...makeInteraction('list'),
                guild: { id: 'guild-1', name: 'TestGuild' },
            } as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: Array<{ description: string }> }
        }
        expect(args.content.embeds[0].description).toContain('today')
    })

    test('list does not mention users in output (parse: [])', async () => {
        memberBirthdayFindMany.mockResolvedValueOnce([
            { userId: 'u1', month: 3, day: 15 },
        ])
        await birthdayCommand.execute({
            interaction: {
                ...makeInteraction('list'),
                guild: { id: 'guild-1', name: 'TestGuild' },
            } as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { allowedMentions: { parse: unknown[] } }
        }
        expect(args.content.allowedMentions).toEqual({ parse: [] })
    })

    test('handles upsert throwing gracefully', async () => {
        memberBirthdayUpsert.mockRejectedValueOnce(new Error('db down'))
        await birthdayCommand.execute({
            interaction: makeInteraction('set', { month: 3, day: 15 }) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Failed')
    })

    test('channel command rejects non-ManageGuild users', async () => {
        const interaction = {
            ...makeInteraction('channel'),
            member: {
                permissions: {
                    has: () => false,
                },
            },
            options: {
                getSubcommand: () => 'channel',
                getChannel: () => null,
            },
        } as never
        await birthdayCommand.execute({ interaction })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Manage Server')
        expect(args.content.content).toContain('birthday channel')
    })

    test('channel command sets the channel when ManageGuild user provides it', async () => {
        const interaction = {
            ...makeInteraction('channel'),
            guild: { id: 'guild-1' },
            member: {
                permissions: {
                    has: () => true,
                },
            },
            options: {
                getSubcommand: () => 'channel',
                getChannel: () => ({ id: 'chan-123' }),
            },
        } as never
        await birthdayCommand.execute({ interaction })
        expect(guildSettingsUpsert).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
            create: { guildId: 'guild-1', birthdayChannelId: 'chan-123' },
            update: { birthdayChannelId: 'chan-123' },
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Birthday announcements')
        expect(args.content.content).toContain('chan-123')
    })

    test('channel command clears the channel when none provided', async () => {
        const interaction = {
            ...makeInteraction('channel'),
            guild: { id: 'guild-1' },
            member: {
                permissions: {
                    has: () => true,
                },
            },
            options: {
                getSubcommand: () => 'channel',
                getChannel: () => null,
            },
        } as never
        await birthdayCommand.execute({ interaction })
        expect(guildSettingsUpsert).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
            create: { guildId: 'guild-1', birthdayChannelId: null },
            update: { birthdayChannelId: null },
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('disabled')
    })

    test('role command rejects non-ManageGuild users', async () => {
        const interaction = {
            ...makeInteraction('role'),
            member: {
                permissions: {
                    has: () => false,
                },
            },
            options: {
                getSubcommand: () => 'role',
                getRole: () => null,
            },
        } as never
        await birthdayCommand.execute({ interaction })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Manage Server')
        expect(args.content.content).toContain('birthday role')
    })

    test('role command sets the role when ManageGuild user provides it', async () => {
        const interaction = {
            ...makeInteraction('role'),
            guild: { id: 'guild-1' },
            member: {
                permissions: {
                    has: () => true,
                },
            },
            options: {
                getSubcommand: () => 'role',
                getRole: () => ({ id: 'role-456' }),
            },
        } as never
        await birthdayCommand.execute({ interaction })
        expect(guildSettingsUpsert).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
            create: { guildId: 'guild-1', birthdayRoleId: 'role-456' },
            update: { birthdayRoleId: 'role-456' },
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Celebrators')
        expect(args.content.content).toContain('role-456')
    })

    test('role command clears the role when none provided', async () => {
        const interaction = {
            ...makeInteraction('role'),
            guild: { id: 'guild-1' },
            member: {
                permissions: {
                    has: () => true,
                },
            },
            options: {
                getSubcommand: () => 'role',
                getRole: () => null,
            },
        } as never
        await birthdayCommand.execute({ interaction })
        expect(guildSettingsUpsert).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
            create: { guildId: 'guild-1', birthdayRoleId: null },
            update: { birthdayRoleId: null },
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('disabled')
    })
})
