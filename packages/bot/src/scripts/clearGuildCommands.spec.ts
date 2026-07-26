import { describe, it, expect, jest } from '@jest/globals'

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

import { Routes } from 'discord.js'
import { clearGuildCommands } from './clearGuildCommands'
import { errorLog } from '@lucky/shared/utils'

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
