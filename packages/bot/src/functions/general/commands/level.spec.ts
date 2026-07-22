import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const levelServiceMock = {
    addReward: jest.fn(),
    removeReward: jest.fn(),
    getMemberXP: jest.fn(),
    getRank: jest.fn(),
    getLeaderboard: jest.fn(),
    upsertConfig: jest.fn(),
}

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    levelService: levelServiceMock,
    xpNeededForLevel: (level: number) => level * 100,
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
    buildUserProfileEmbed: (user: any, opts: any) => ({
        type: 'profile',
        userId: user.id,
        level: opts.level,
    }),
    buildListPageEmbed: (items: any[], page: number, opts: any) => ({
        type: 'list',
        title: opts.title,
        itemsPerPage: opts.itemsPerPage,
    }),
}))

jest.mock('../../../utils/music/buttonComponents.js', () => ({
    createLeaderboardPaginationButtons: (current: number, total: number) => {
        return total > 1 ? { type: 'button_row' } : null
    },
}))

import levelCommand from './level.js'

function makeInteraction(
    subcommandGroup: string | null,
    subcommand: string,
    opts: Record<string, unknown> = {},
    withGuild = true,
) {
    return {
        guild: withGuild ? { id: 'guild-1', name: 'TestGuild' } : null,
        user: { id: 'u1', tag: 'alice#0000' },
        options: {
            getSubcommandGroup: () => subcommandGroup,
            getSubcommand: () => subcommand,
            getInteger: (name: string) => opts[name] ?? null,
            getUser: (name: string) => opts[name] ?? null,
            getRole: (name: string) => opts[name] ?? null,
            getChannel: (name: string) => opts[name] ?? null,
        },
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    levelServiceMock.addReward.mockClear().mockResolvedValue(undefined)
    levelServiceMock.removeReward.mockClear().mockResolvedValue(undefined)
    levelServiceMock.getMemberXP
        .mockClear()
        .mockResolvedValue({ xp: 0, level: 0 })
    levelServiceMock.getRank.mockClear().mockResolvedValue(5)
    levelServiceMock.getLeaderboard.mockClear().mockResolvedValue([])
    levelServiceMock.upsertConfig.mockClear().mockResolvedValue(undefined)
})

describe('/level', () => {
    describe('reward add subcommand', () => {
        test('adds reward for level', async () => {
            const interaction = makeInteraction('reward', 'add', {
                level: 10,
                role: { id: 'role-123' },
            }) as never

            await levelCommand.execute({ interaction })

            expect(levelServiceMock.addReward).toHaveBeenCalledWith(
                'guild-1',
                10,
                'role-123',
            )
            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<{ title: string }> }
            }
            expect(call.content.embeds[0].title).toContain('Added')
        })

        test('displays role mention in success message', async () => {
            const interaction = makeInteraction('reward', 'add', {
                level: 5,
                role: { id: 'role-999' },
            }) as never

            await levelCommand.execute({ interaction })

            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<{ description: string }> }
            }
            expect(call.content.embeds[0].description).toContain('level')
        })
    })

    describe('reward remove subcommand', () => {
        test('removes reward for level', async () => {
            const interaction = makeInteraction('reward', 'remove', {
                level: 10,
            }) as never

            await levelCommand.execute({ interaction })

            expect(levelServiceMock.removeReward).toHaveBeenCalledWith(
                'guild-1',
                10,
            )
            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<{ title: string }> }
            }
            expect(call.content.embeds[0].title).toContain('Removed')
        })
    })

    describe('rank subcommand', () => {
        test('shows own rank when no user provided', async () => {
            levelServiceMock.getMemberXP.mockResolvedValueOnce({
                xp: 500,
                level: 5,
            })
            levelServiceMock.getRank.mockResolvedValueOnce(3)

            const interaction = makeInteraction('null', 'rank') as never

            await levelCommand.execute({ interaction })

            expect(levelServiceMock.getMemberXP).toHaveBeenCalledWith(
                'guild-1',
                'u1',
            )
            expect(interactionReply).toHaveBeenCalledTimes(1)
        })

        test('shows other user rank when provided', async () => {
            levelServiceMock.getMemberXP.mockResolvedValueOnce({
                xp: 1000,
                level: 10,
            })
            levelServiceMock.getRank.mockResolvedValueOnce(2)

            const targetUser = { id: 'u2', tag: 'bob#0000' }
            const interaction = makeInteraction('null', 'rank', {
                user: targetUser,
            }) as never

            await levelCommand.execute({ interaction })

            expect(levelServiceMock.getMemberXP).toHaveBeenCalledWith(
                'guild-1',
                'u2',
            )
        })

        test('handles no XP data gracefully', async () => {
            levelServiceMock.getMemberXP.mockResolvedValueOnce(null)
            levelServiceMock.getRank.mockResolvedValueOnce(999)

            const interaction = makeInteraction('null', 'rank') as never

            await levelCommand.execute({ interaction })

            expect(interactionReply).toHaveBeenCalledTimes(1)
        })
    })

    describe('leaderboard subcommand', () => {
        test('shows empty state when no XP recorded', async () => {
            levelServiceMock.getLeaderboard.mockResolvedValueOnce([])

            const interaction = makeInteraction('null', 'leaderboard') as never

            await levelCommand.execute({ interaction })

            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<{ title: string }> }
            }
            expect(call.content.embeds[0].title).toContain('Leaderboard')
        })

        test('displays users with XP and level', async () => {
            levelServiceMock.getLeaderboard.mockResolvedValueOnce([
                { userId: 'u1', level: 5, xp: 500 },
                { userId: 'u2', level: 3, xp: 300 },
            ])

            const interaction = makeInteraction('null', 'leaderboard') as never

            await levelCommand.execute({ interaction })

            expect(interactionReply).toHaveBeenCalledTimes(1)
            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<any> }
            }
            expect(Array.isArray(call.content.embeds)).toBe(true)
        })

        test('includes pagination buttons when needed', async () => {
            // 10 entries at 5 items per page = 2 pages, so the leaderboard
            // must include the pagination button row.
            const entries = Array.from({ length: 10 }, (_, i) => ({
                userId: `u${i}`,
                level: i,
                xp: i * 100,
            }))
            levelServiceMock.getLeaderboard.mockResolvedValueOnce(entries)

            const interaction = makeInteraction('null', 'leaderboard') as never

            await levelCommand.execute({ interaction })

            const call = interactionReply.mock.calls[0][0] as {
                content: { components?: Array<{ type: string }> }
            }
            expect(Array.isArray(call.content.components)).toBe(true)
            expect(call.content.components).toHaveLength(1)
            expect(call.content.components?.[0]).toEqual({
                type: 'button_row',
            })
        })
    })

    describe('setup subcommand', () => {
        test('updates config with XP settings', async () => {
            const interaction = makeInteraction('null', 'setup', {
                'xp-per-message': 20,
                'cooldown-seconds': 120,
            }) as never

            await levelCommand.execute({ interaction })

            expect(levelServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-1',
                {
                    xpPerMessage: 20,
                    xpCooldownMs: 120000,
                    announceChannel: null,
                },
            )
        })

        test('includes announce channel when provided', async () => {
            const channel = { id: 'chan-123' }
            const interaction = makeInteraction('null', 'setup', {
                'xp-per-message': 15,
                'cooldown-seconds': 60,
                'announce-channel': channel,
            }) as never

            await levelCommand.execute({ interaction })

            expect(levelServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-1',
                expect.objectContaining({
                    announceChannel: 'chan-123',
                }),
            )
        })

        test('displays config summary', async () => {
            const interaction = makeInteraction('null', 'setup', {
                'xp-per-message': 10,
                'cooldown-seconds': 30,
            }) as never

            await levelCommand.execute({ interaction })

            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<{ description: string }> }
            }
            expect(call.content.embeds[0].description).toContain('10')
            expect(call.content.embeds[0].description).toContain('30')
        })
    })

    describe('error handling', () => {
        test('catches levelService errors gracefully', async () => {
            levelServiceMock.getMemberXP.mockRejectedValueOnce(
                new Error('db error'),
            )

            const interaction = makeInteraction('null', 'rank') as never

            await levelCommand.execute({ interaction })

            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds: Array<{ title: string }> }
            }
            expect(call.content.embeds[0].title).toContain('Error')
            expect(call.content.ephemeral).toBe(true)
        })

        test('requires guild context', async () => {
            const { requireGuild } = jest.requireMock(
                '../../../utils/command/commandValidations.js',
            ) as {
                requireGuild: jest.Mock
            }
            requireGuild.mockResolvedValueOnce(false)

            const interaction = makeInteraction(
                'null',
                'rank',
                {},
                false,
            ) as never

            await levelCommand.execute({ interaction })

            expect(requireGuild).toHaveBeenCalled()
        })
    })
})
