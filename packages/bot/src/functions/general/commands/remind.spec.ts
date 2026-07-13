import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

const reminderServiceMock = {
    create: jest.fn(),
    listPending: jest.fn(),
    findPendingByIdPrefix: jest.fn(),
    deleteOwned: jest.fn(),
}
jest.mock('@lucky/shared/services', () => ({
    reminderService: reminderServiceMock,
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: {
        interaction: unknown
        content: unknown
        ephemeral?: boolean
    }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

import remindCommand, { parseDuration } from './remind.js'

function makeInteraction(
    subcommand: string,
    tempo?: string,
    mensagem?: string,
    reminderId?: string,
    withGuild = true,
) {
    return {
        guild: withGuild ? { id: 'guild-1', name: 'TestGuild' } : null,
        user: { id: 'u1', tag: 'alice#0' },
        channelId: 'channel-1',
        options: {
            getSubcommand: () => subcommand,
            getString: (name: string) => {
                if (name === 'tempo') return tempo ?? null
                if (name === 'mensagem') return mensagem ?? null
                if (name === 'id') return reminderId ?? null
                return null
            },
        },
    }
}

/** Build a channel/role broadcast interaction with a Manage-Server toggle. */
function makeBroadcastInteraction(
    subcommand: 'channel' | 'role',
    { tempo = '10m', mensagem = 'Standup!', canManage = true } = {},
) {
    return {
        guild: { id: 'guild-1', name: 'TestGuild' },
        user: { id: 'u1', tag: 'alice#0' },
        channelId: 'channel-1',
        memberPermissions: { has: () => canManage },
        options: {
            getSubcommand: () => subcommand,
            getString: (name: string) => {
                if (name === 'tempo') return tempo
                if (name === 'mensagem') return mensagem
                return null
            },
            getChannel: () => ({ id: 'target-chan' }),
            getRole: () => ({ id: 'target-role' }),
        },
    }
}

describe('parseDuration', () => {
    test('parses seconds correctly', () => {
        expect(parseDuration('30s')).toBe(30 * 1000)
        expect(parseDuration('1s')).toBe(1000)
    })

    test('parses minutes correctly', () => {
        expect(parseDuration('10m')).toBe(10 * 60 * 1000)
        expect(parseDuration('1m')).toBe(60 * 1000)
    })

    test('parses hours correctly', () => {
        expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000)
        expect(parseDuration('1h')).toBe(60 * 60 * 1000)
    })

    test('parses days correctly', () => {
        expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000)
        expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000)
    })

    test('rejects invalid formats', () => {
        expect(parseDuration('invalid')).toBeNull()
        expect(parseDuration('10')).toBeNull()
        expect(parseDuration('m10')).toBeNull()
        expect(parseDuration('10x')).toBeNull()
        expect(parseDuration('')).toBeNull()
    })

    test('rejects durations > 30 days', () => {
        expect(parseDuration('31d')).toBeNull()
        expect(parseDuration('1000h')).toBeNull()
    })

    test('accepts exactly 30 days', () => {
        const thirtyDays = 30 * 24 * 60 * 60 * 1000
        expect(parseDuration('30d')).toBe(thirtyDays)
    })
})

describe('/remind command', () => {
    beforeEach(() => {
        reminderServiceMock.create.mockReset().mockResolvedValue({
            id: 'reminder-123',
            guildId: 'guild-1',
            userId: 'u1',
            channelId: 'channel-1',
            message: 'Test reminder',
            remindAt: new Date(),
            delivered: false,
            createdAt: new Date(),
        })
        reminderServiceMock.listPending.mockReset().mockResolvedValue([])
        reminderServiceMock.findPendingByIdPrefix
            .mockReset()
            .mockResolvedValue([])
        reminderServiceMock.deleteOwned.mockReset().mockResolvedValue(true)
        interactionReply.mockClear().mockResolvedValue(undefined)
    })

    test('rejects when not in a guild', async () => {
        await remindCommand.execute({
            interaction: makeInteraction(
                'set',
                '10m',
                'Test',
                undefined,
                false,
            ) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('server')
    })

    test('set: rejects invalid tempo format', async () => {
        await remindCommand.execute({
            interaction: makeInteraction(
                'set',
                'invalid',
                'Test message',
            ) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Invalid duration')
    })

    test('set: rejects tempo > 30 days', async () => {
        await remindCommand.execute({
            interaction: makeInteraction('set', '31d', 'Test message') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Invalid duration')
    })

    test('set: creates reminder and confirms ephemeral', async () => {
        await remindCommand.execute({
            interaction: makeInteraction(
                'set',
                '10m',
                'Remember to drink water',
            ) as never,
        })
        expect(reminderServiceMock.create).toHaveBeenCalledWith(
            'guild-1',
            'u1',
            'channel-1',
            'Remember to drink water',
            expect.any(Date),
        )
        const args = interactionReply.mock.calls[0][0] as {
            content: { embeds: unknown[]; ephemeral?: boolean }
        }
        expect(args.content.ephemeral).toBe(true)
        expect(args.content.embeds).toBeDefined()
    })

    test('list: shows empty message when no reminders', async () => {
        reminderServiceMock.listPending.mockResolvedValue([])
        await remindCommand.execute({
            interaction: makeInteraction('list') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral?: boolean }
        }
        expect(args.content.content).toContain("don't have any")
        expect(args.content.ephemeral).toBe(true)
    })

    test('list: shows reminders with IDs', async () => {
        const futureDate = new Date(Date.now() + 600000)
        reminderServiceMock.listPending.mockResolvedValue([
            {
                id: 'abc12345xyz',
                guildId: 'guild-1',
                userId: 'u1',
                channelId: 'channel-1',
                message: 'Test reminder 1',
                remindAt: futureDate,
                delivered: false,
                createdAt: new Date(),
            },
        ])
        await remindCommand.execute({
            interaction: makeInteraction('list') as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: {
                embeds: Array<{ description: string }>
                ephemeral?: boolean
            }
        }
        expect(args.content.ephemeral).toBe(true)
        expect(args.content.embeds[0].description).toContain('reminder')
        expect(args.content.embeds[0].description).toContain('Test reminder 1')
    })

    test('delete: rejects when reminder not found', async () => {
        reminderServiceMock.listPending.mockResolvedValue([])
        await remindCommand.execute({
            interaction: makeInteraction(
                'delete',
                undefined,
                undefined,
                'nonexistent',
            ) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral?: boolean }
        }
        expect(args.content.content).toContain('not found')
        expect(args.content.ephemeral).toBe(true)
    })

    test('channel: rejects without Manage Server permission', async () => {
        await remindCommand.execute({
            interaction: makeBroadcastInteraction('channel', {
                canManage: false,
            }) as never,
        })
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string }
        }
        expect(args.content.content).toContain('Manage Server')
        expect(reminderServiceMock.create).not.toHaveBeenCalled()
    })

    test('channel: creates a channel-scoped reminder for a manager', async () => {
        await remindCommand.execute({
            interaction: makeBroadcastInteraction('channel') as never,
        })
        expect(reminderServiceMock.create).toHaveBeenCalledWith(
            'guild-1',
            'u1',
            'target-chan',
            'Standup!',
            expect.any(Date),
            { targetType: 'channel', roleId: null },
        )
    })

    test('role: creates a role-scoped reminder carrying the roleId', async () => {
        await remindCommand.execute({
            interaction: makeBroadcastInteraction('role') as never,
        })
        expect(reminderServiceMock.create).toHaveBeenCalledWith(
            'guild-1',
            'u1',
            'target-chan',
            'Standup!',
            expect.any(Date),
            { targetType: 'role', roleId: 'target-role' },
        )
    })

    test('delete: deletes reminder and confirms', async () => {
        const reminder = {
            id: 'abc12345xyz',
            guildId: 'guild-1',
            userId: 'u1',
            channelId: 'channel-1',
            message: 'Test reminder',
            remindAt: new Date(),
            delivered: false,
            createdAt: new Date(),
        }
        reminderServiceMock.findPendingByIdPrefix.mockResolvedValueOnce([
            reminder,
        ])
        await remindCommand.execute({
            interaction: makeInteraction(
                'delete',
                undefined,
                undefined,
                'abc12345',
            ) as never,
        })
        expect(reminderServiceMock.findPendingByIdPrefix).toHaveBeenCalledWith(
            'guild-1',
            'u1',
            'abc12345',
        )
        expect(reminderServiceMock.deleteOwned).toHaveBeenCalledWith(
            'guild-1',
            'u1',
            'abc12345xyz',
        )
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral?: boolean }
        }
        expect(args.content.content).toContain('deleted')
        expect(args.content.ephemeral).toBe(true)
    })
})
