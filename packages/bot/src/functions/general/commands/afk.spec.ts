import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const afkServiceMock = {
    set: jest.fn(),
    clear: jest.fn(),
}

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    afkService: afkServiceMock,
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

import afkCommand from './afk.js'

function makeInteraction(motivo?: string | null, withGuild = true) {
    return {
        guild: withGuild ? { id: 'guild-1' } : null,
        user: { id: 'u1', tag: 'alice#0000' },
        options: {
            getString: (name: string) => {
                if (name === 'motivo') return motivo ?? null
                return null
            },
        },
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    afkServiceMock.set.mockClear().mockResolvedValue(undefined)
    afkServiceMock.clear.mockClear().mockResolvedValue(undefined)
})

describe('/afk', () => {
    test('rejects when used in DMs (no guild)', async () => {
        await afkCommand.execute({
            interaction: makeInteraction(undefined, false) as never,
        })

        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral: boolean }
        }
        expect(args.content.content).toContain('Unable to determine guild')
        expect(args.content.ephemeral).toBe(true)
        expect(afkServiceMock.set).not.toHaveBeenCalled()
        expect(afkServiceMock.clear).not.toHaveBeenCalled()
    })

    test('clears AFK when no reason provided', async () => {
        await afkCommand.execute({
            interaction: makeInteraction(null) as never,
        })

        expect(afkServiceMock.clear).toHaveBeenCalledWith('guild-1', 'u1')
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral: boolean }
        }
        expect(args.content.content).toContain('Welcome back')
        expect(args.content.content).toContain('cleared')
    })

    test('sets AFK with reason when provided', async () => {
        await afkCommand.execute({
            interaction: makeInteraction('In a meeting') as never,
        })

        expect(afkServiceMock.set).toHaveBeenCalledWith(
            'guild-1',
            'u1',
            'In a meeting',
        )
        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral: boolean }
        }
        expect(args.content.content).toContain('AFK set')
        expect(args.content.content).toContain('In a meeting')
    })

    test('marks response as ephemeral', async () => {
        await afkCommand.execute({
            interaction: makeInteraction('Working') as never,
        })

        const args = interactionReply.mock.calls[0][0] as {
            content: { ephemeral: boolean }
        }
        expect(args.content.ephemeral).toBe(true)
    })

    test('handles afkService.set error gracefully', async () => {
        afkServiceMock.set.mockRejectedValueOnce(new Error('db error'))

        await afkCommand.execute({
            interaction: makeInteraction('Sleeping') as never,
        })

        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral: boolean }
        }
        expect(args.content.content).toContain('Failed to update')
    })

    test('handles afkService.clear error gracefully', async () => {
        afkServiceMock.clear.mockRejectedValueOnce(new Error('db error'))

        await afkCommand.execute({
            interaction: makeInteraction(null) as never,
        })

        const args = interactionReply.mock.calls[0][0] as {
            content: { content: string; ephemeral: boolean }
        }
        expect(args.content.content).toContain('Failed to update')
    })

    test('respects max reason length constraint', async () => {
        const longReason = 'x'.repeat(250)
        await afkCommand.execute({
            interaction: makeInteraction(longReason) as never,
        })

        expect(afkServiceMock.set).toHaveBeenCalledWith(
            'guild-1',
            'u1',
            longReason,
        )
    })

    test('includes user tag in info log when setting AFK', async () => {
        const { infoLog } = jest.requireMock('@lucky/shared/utils') as {
            infoLog: jest.Mock
        }
        infoLog.mockClear()

        await afkCommand.execute({
            interaction: makeInteraction('Lunch break') as never,
        })

        expect(infoLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('alice#0000'),
            }),
        )
    })
})
