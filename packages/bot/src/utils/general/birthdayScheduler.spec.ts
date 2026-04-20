import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => {
    const findMany = jest.fn()
    const settingsFindUnique = jest.fn()
    return {
        infoLog: jest.fn(),
        debugLog: jest.fn(),
        errorLog: jest.fn(),
        getPrismaClient: () => ({
            memberBirthday: { findMany },
            guildSettings: { findUnique: settingsFindUnique },
        }),
        __mocks: { findMany, settingsFindUnique },
    }
})

const { __mocks: dbMocks } = jest.requireMock('@lucky/shared/utils') as {
    __mocks: {
        findMany: jest.MockedFunction<(args?: unknown) => Promise<unknown>>
        settingsFindUnique: jest.MockedFunction<
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
})

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
