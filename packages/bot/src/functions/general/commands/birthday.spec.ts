import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => {
    const upsert = jest.fn()
    const deleteMany = jest.fn()
    return {
        infoLog: jest.fn(),
        debugLog: jest.fn(),
        errorLog: jest.fn(),
        getPrismaClient: () => ({ memberBirthday: { upsert, deleteMany } }),
        __mocks: { upsert, deleteMany },
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
const interactionReply = replyMocks.interactionReply

import birthdayCommand from './birthday.js'

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
    interactionReply.mockClear().mockResolvedValue(undefined)
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
})
