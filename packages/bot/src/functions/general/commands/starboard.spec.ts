import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const starboardServiceMock = {
    upsertConfig: jest.fn(),
    deleteConfig: jest.fn(),
    getTopEntries: jest.fn(),
    getConfig: jest.fn(),
}

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    starboardService: starboardServiceMock,
}))

jest.mock('../../../utils/command/commandValidations.js', () => ({
    requireGuild: jest.fn().mockResolvedValue(true),
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

jest.mock('../../../utils/general/embeds.js', () => ({
    createSuccessEmbed: (title: string, desc: string) => ({
        title,
        description: desc,
    }),
    createErrorEmbed: (title: string, desc: string) => ({
        title,
        description: desc,
    }),
    createInfoEmbed: (title: string, desc: string) => ({
        title,
        description: desc,
    }),
}))

jest.mock('../../../utils/general/responseEmbeds.js', () => ({
    buildListPageEmbed: (items: any[], page: number, opts: any) => ({
        type: 'list',
        title: opts.title,
    }),
}))

import starboardCommand from './starboard.js'

function makeInteraction(
    subcommand: string,
    opts: Record<string, unknown> = {},
    withGuild = true,
) {
    return {
        guild: withGuild ? { id: 'guild-1', name: 'TestGuild' } : null,
        user: { id: 'u1', tag: 'alice#0000' },
        options: {
            getSubcommand: () => subcommand,
            getChannel: (name: string) => opts[name] ?? null,
            getString: (name: string) => opts[name] ?? null,
            getInteger: (name: string) => opts[name] ?? null,
            getBoolean: (name: string) => opts[name] ?? false,
        },
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    starboardServiceMock.upsertConfig.mockClear().mockResolvedValue(undefined)
    starboardServiceMock.deleteConfig.mockClear().mockResolvedValue(undefined)
    starboardServiceMock.getTopEntries.mockClear().mockResolvedValue([])
    starboardServiceMock.getConfig.mockClear().mockResolvedValue(null)
})

describe('/starboard', () => {
    test('requires guild context', async () => {
        const { requireGuild } = jest.requireMock(
            '../../../utils/command/commandValidations.js',
        ) as {
            requireGuild: jest.Mock
        }
        requireGuild.mockResolvedValueOnce(false)

        const interaction = makeInteraction('setup', {}, false) as never

        await starboardCommand.execute({ interaction })

        expect(requireGuild).toHaveBeenCalled()
    })

    describe('setup subcommand', () => {
        test('sets up starboard with channel', async () => {
            const channel = { id: 'chan-123' }
            const interaction = makeInteraction('setup', {
                channel,
            }) as never

            await starboardCommand.execute({ interaction })

            expect(starboardServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-1',
                expect.objectContaining({
                    channelId: 'chan-123',
                }),
            )
        })

        test('uses custom emoji when provided', async () => {
            const channel = { id: 'chan-123' }
            const interaction = makeInteraction('setup', {
                channel,
                emoji: '👍',
            }) as never

            await starboardCommand.execute({ interaction })

            expect(starboardServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-1',
                expect.objectContaining({
                    emoji: '👍',
                }),
            )
        })

        test('uses custom threshold when provided', async () => {
            const channel = { id: 'chan-123' }
            const interaction = makeInteraction('setup', {
                channel,
                threshold: 5,
            }) as never

            await starboardCommand.execute({ interaction })

            expect(starboardServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-1',
                expect.objectContaining({
                    threshold: 5,
                }),
            )
        })

        test('allows self-star setting', async () => {
            const channel = { id: 'chan-123' }
            const interaction = makeInteraction('setup', {
                channel,
                'self-star': true,
            }) as never

            await starboardCommand.execute({ interaction })

            expect(starboardServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-1',
                expect.any(Object),
            )
        })
    })

    describe('disable subcommand', () => {
        test('disables starboard', async () => {
            const interaction = makeInteraction('disable') as never

            await starboardCommand.execute({ interaction })

            expect(starboardServiceMock.deleteConfig).toHaveBeenCalledWith(
                'guild-1',
            )
            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds?: Array<{ title: string }> }
            }
            expect(call.content.embeds?.[0]?.title).toContain('Disabled')
        })
    })

    describe('top subcommand', () => {
        test('shows empty state when no stars', async () => {
            starboardServiceMock.getTopEntries.mockResolvedValueOnce([])

            const interaction = makeInteraction('top') as never

            await starboardCommand.execute({ interaction })

            expect(interactionReply).toHaveBeenCalledTimes(1)
        })

        test('displays top starred messages', async () => {
            starboardServiceMock.getTopEntries.mockResolvedValueOnce([
                {
                    guildId: 'guild-1',
                    channelId: 'chan-1',
                    messageId: 'msg-1',
                    starCount: 10,
                },
                {
                    guildId: 'guild-1',
                    channelId: 'chan-1',
                    messageId: 'msg-2',
                    starCount: 8,
                },
            ])

            const interaction = makeInteraction('top') as never

            await starboardCommand.execute({ interaction })

            expect(interactionReply).toHaveBeenCalledTimes(1)
        })
    })

    describe('error handling', () => {
        test('catches starboardService errors gracefully', async () => {
            const channel = { id: 'chan-123' }
            starboardServiceMock.upsertConfig.mockRejectedValueOnce(
                new Error('db error'),
            )

            const interaction = makeInteraction('setup', { channel }) as never

            await starboardCommand.execute({ interaction })

            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds?: Array<{ title: string }> }
            }
            expect(call.content.embeds?.[0]?.title).toContain('Error')
            expect(call.content.ephemeral).toBe(true)
        })
    })
})
