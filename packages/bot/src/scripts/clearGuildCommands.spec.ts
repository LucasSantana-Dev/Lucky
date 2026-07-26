import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    config: jest.fn().mockReturnValue({
        TOKEN: 'test-token',
        CLIENT_ID: 'test-client-id',
    }),
}))

jest.mock('discord.js', () => {
    const actual = jest.requireActual<typeof import('discord.js')>('discord.js')
    return {
        ...actual,
        REST: jest.fn().mockImplementation(() => ({
            setToken: jest.fn().mockReturnThis(),
            get: jest.fn<any>().mockResolvedValue([]),
            put: jest.fn<any>().mockResolvedValue(undefined),
        })),
    }
})

import { REST, Routes } from 'discord.js'
import {
    clearGuildCommands,
    fetchAllGuilds,
    runClearGuildCommands,
} from './clearGuildCommands'
import { errorLog } from '@lucky/shared/utils'
import { config } from '@lucky/shared/config'

const restInstance = () => {
    const results = (REST as unknown as jest.Mock).mock.results
    return results[results.length - 1]?.value as {
        get: jest.Mock
        put: jest.Mock
    }
}

const guilds = [
    { id: 'g1', name: 'One' },
    { id: 'g2', name: 'Two' },
    { id: 'g3', name: 'Three' },
]

describe('clearGuildCommands', () => {
    it('clears every guild with an empty command body', async () => {
        const put = jest.fn<any>().mockResolvedValue(undefined)

        const result = await clearGuildCommands(guilds, {
            rest: { put } as any,
            clientId: 'test-client-id',
        })

        expect(result.cleared).toEqual(['One', 'Two', 'Three'])
        expect(result.failed).toEqual([])
        for (const guild of guilds) {
            expect(put).toHaveBeenCalledWith(
                Routes.applicationGuildCommands('test-client-id', guild.id),
                { body: [] },
            )
        }
    })

    // Without a per-guild catch, one rejected call aborts the loop and every
    // guild after it silently keeps its stale commands, which then shadow the
    // global set. Raised by CodeRabbit and cubic on #1887.
    it('does nothing for an empty guild list', async () => {
        const put = jest.fn<any>().mockResolvedValue(undefined)

        const result = await clearGuildCommands([], {
            rest: { put } as any,
            clientId: 'test-client-id',
        })

        expect(put).not.toHaveBeenCalled()
        expect(result).toEqual({ cleared: [], failed: [] })
    })

    it('reports every guild when they all fail', async () => {
        const put = jest.fn<any>().mockRejectedValue(new Error('429'))

        const result = await clearGuildCommands(guilds, {
            rest: { put } as any,
            clientId: 'test-client-id',
        })

        expect(result.cleared).toEqual([])
        expect(result.failed).toEqual(guilds)
    })

    it('keeps going when one guild fails, and reports it', async () => {
        const put = jest
            .fn<any>()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('Missing Access'))
            .mockResolvedValueOnce(undefined)

        const result = await clearGuildCommands(guilds, {
            rest: { put } as any,
            clientId: 'test-client-id',
        })

        expect(put).toHaveBeenCalledTimes(3)
        expect(result.cleared).toEqual(['One', 'Three'])
        expect(result.failed).toEqual([{ id: 'g2', name: 'Two' }])
        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to clear guild-scoped commands: Two',
            }),
        )
    })
})

describe('fetchAllGuilds', () => {
    const page = (from: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
            id: `g${from + i}`,
            name: `Guild ${from + i}`,
        }))

    it('returns a single short page without asking for more', async () => {
        const get = jest.fn<any>().mockResolvedValue(page(0, 11))

        const guilds = await fetchAllGuilds({ get } as any)

        expect(guilds).toHaveLength(11)
        expect(get).toHaveBeenCalledTimes(1)
    })

    // Discord caps this endpoint at 200 per page. Stopping after the first page
    // would silently skip every guild beyond it, leaving them shadowing the
    // global commands with no error at all.
    it('follows pagination until a short page arrives', async () => {
        const get = jest
            .fn<any>()
            .mockResolvedValueOnce(page(0, 200))
            .mockResolvedValueOnce(page(200, 200))
            .mockResolvedValueOnce(page(400, 7))

        const guilds = await fetchAllGuilds({ get } as any)

        expect(guilds).toHaveLength(407)
        expect(get).toHaveBeenCalledTimes(3)

        // Each follow-up page must start after the last id of the previous one,
        // or the same 200 come back forever.
        const secondCallQuery = get.mock.calls[1][1].query as URLSearchParams
        expect(secondCallQuery.get('after')).toBe('g199')
        const thirdCallQuery = get.mock.calls[2][1].query as URLSearchParams
        expect(thirdCallQuery.get('after')).toBe('g399')
    })

    it('stops on an exactly-full final page followed by an empty one', async () => {
        const get = jest
            .fn<any>()
            .mockResolvedValueOnce(page(0, 200))
            .mockResolvedValueOnce([])

        const guilds = await fetchAllGuilds({ get } as any)

        expect(guilds).toHaveLength(200)
        expect(get).toHaveBeenCalledTimes(2)
    })
})

describe('runClearGuildCommands', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(config as jest.Mock).mockReturnValue({
            TOKEN: 'test-token',
            CLIENT_ID: 'test-client-id',
        })
    })

    it.each([
        ['TOKEN', { TOKEN: '', CLIENT_ID: 'test-client-id' }],
        ['CLIENT_ID', { TOKEN: 'test-token', CLIENT_ID: '' }],
    ])('refuses to run when %s is missing', async (_label, cfg) => {
        ;(config as jest.Mock).mockReturnValue(cfg)

        await expect(runClearGuildCommands()).rejects.toThrow(
            'DISCORD_TOKEN or CLIENT_ID not configured',
        )
    })

    it('reads the guild list and clears each one', async () => {
        const guildList = [
            { id: 'g1', name: 'One' },
            { id: 'g2', name: 'Two' },
        ]
        ;(REST as unknown as jest.Mock).mockImplementationOnce(() => ({
            setToken: jest.fn().mockReturnThis(),
            get: jest.fn<any>().mockResolvedValue(guildList),
            put: jest.fn<any>().mockResolvedValue(undefined),
        }))

        const result = await runClearGuildCommands()
        const rest = restInstance()

        expect(rest.get).toHaveBeenCalledWith(
            Routes.userGuilds(),
            expect.objectContaining({ query: expect.any(URLSearchParams) }),
        )
        expect(result.cleared).toEqual(['One', 'Two'])
        expect(result.failed).toEqual([])
        for (const guild of guildList) {
            expect(rest.put).toHaveBeenCalledWith(
                Routes.applicationGuildCommands('test-client-id', guild.id),
                { body: [] },
            )
        }
    })

    it('reports the guilds it could not clear', async () => {
        const guildList = [
            { id: 'g1', name: 'One' },
            { id: 'g2', name: 'Two' },
        ]
        ;(REST as unknown as jest.Mock).mockImplementationOnce(() => ({
            setToken: jest.fn().mockReturnThis(),
            get: jest.fn<any>().mockResolvedValue(guildList),
            put: jest
                .fn<any>()
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Missing Access')),
        }))

        const result = await runClearGuildCommands()

        expect(result.cleared).toEqual(['One'])
        expect(result.failed).toEqual([{ id: 'g2', name: 'Two' }])
    })
})
