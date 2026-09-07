import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createSuccessEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: jest.fn(async () => true),
    requireQueue: jest.fn(async () => true),
    requireIsPlaying: jest.fn(async () => true),
    requireDJRoleInGuild: jest.fn(async () => true),
}))

jest.mock('@lucky/shared/utils/guards', () => ({
    assertDefined: jest.fn((value: unknown) => value),
}))

import effectsCommand from './effects'
import { interactionReply } from '../../../utils/general/interactionReply'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import {
    requireGuild,
    requireQueue,
    requireIsPlaying,
    requireDJRoleInGuild,
} from '../../../utils/command/commandValidations'

const createQueue = () => ({
    filters: {
        ffmpeg: {
            toggle: jest.fn(async () => undefined),
            setFilters: jest.fn(async () => undefined),
        },
        resampler: {
            toggleFilter: jest.fn(() => true),
        },
    },
})

const createInteraction = (
    subcommand: string,
    level: number | null = null,
) => ({
    guildId: 'guild-1',
    options: {
        getSubcommand: jest.fn(() => subcommand),
        getInteger: jest.fn(() => level),
    },
})

const execute = effectsCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('effects command', () => {
    let queue: ReturnType<typeof createQueue>

    beforeEach(() => {
        jest.clearAllMocks()
        queue = createQueue()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })
        ;(requireGuild as jest.Mock).mockResolvedValue(true)
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
        ;(requireIsPlaying as jest.Mock).mockResolvedValue(true)
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(true)
    })

    it('stops before resolving a queue when not in a guild', async () => {
        ;(requireGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('reset') as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when the caller lacks the DJ role', async () => {
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('reset') as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when there is no active queue', async () => {
        ;(requireQueue as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('reset') as any,
        })

        expect(queue.filters.ffmpeg.setFilters).not.toHaveBeenCalled()
    })

    it('stops when nothing is playing', async () => {
        ;(requireIsPlaying as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('reset') as any,
        })

        expect(queue.filters.ffmpeg.setFilters).not.toHaveBeenCalled()
    })

    describe('bassboost', () => {
        it('rejects a level below 0', async () => {
            await execute({
                client: {},
                interaction: createInteraction('bassboost', -1) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            description:
                                '🔊 Bass boost level must be between 0 and 5!',
                        }),
                    ],
                },
            })
            expect(queue.filters.ffmpeg.toggle).not.toHaveBeenCalled()
        })

        it('rejects a level above 5', async () => {
            await execute({
                client: {},
                interaction: createInteraction('bassboost', 6) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            description:
                                '🔊 Bass boost level must be between 0 and 5!',
                        }),
                    ],
                },
            })
            expect(queue.filters.ffmpeg.toggle).not.toHaveBeenCalled()
        })

        it('toggles bassboost_high twice to fully disable at level 0', async () => {
            await execute({
                client: {},
                interaction: createInteraction('bassboost', 0) as any,
            })

            expect(queue.filters.ffmpeg.toggle).toHaveBeenNthCalledWith(1, [
                'bassboost_high',
            ])
            expect(queue.filters.ffmpeg.toggle).toHaveBeenNthCalledWith(2, [
                'bassboost_high',
            ])
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            description: '🔊 Bass boost disabled',
                        }),
                    ],
                },
            })
        })

        it.each([
            [1, 'bassboost_low'],
            [2, 'bassboost_low'],
            [3, 'bassboost'],
            [4, 'bassboost'],
            [5, 'bassboost_high'],
        ])('applies the mapped filter for level %i', async (level, filter) => {
            await execute({
                client: {},
                interaction: createInteraction('bassboost', level) as any,
            })

            expect(queue.filters.ffmpeg.toggle).toHaveBeenCalledWith([filter])
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            description: `🔊 Bass boost level set to ${level}`,
                        }),
                    ],
                },
            })
        })

        it('reports failure when the filter toggle rejects', async () => {
            ;(queue.filters.ffmpeg.toggle as jest.Mock).mockRejectedValueOnce(
                new Error('ffmpeg unavailable'),
            )

            await execute({
                client: {},
                interaction: createInteraction('bassboost', 3) as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Error',
                            description: 'Failed to apply bass boost effect.',
                        }),
                    ],
                },
            })
        })
    })

    describe('nightcore', () => {
        it('reports enabled when the resampler toggles on', async () => {
            ;(
                queue.filters.resampler.toggleFilter as jest.Mock
            ).mockReturnValue(true)

            await execute({
                client: {},
                interaction: createInteraction('nightcore') as any,
            })

            expect(queue.filters.resampler.toggleFilter).toHaveBeenCalledWith(
                'nightcore',
            )
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            description: '🎵 Nightcore enabled',
                        }),
                    ],
                },
            })
        })

        it('reports disabled when the resampler toggles off', async () => {
            ;(
                queue.filters.resampler.toggleFilter as jest.Mock
            ).mockReturnValue(false)

            await execute({
                client: {},
                interaction: createInteraction('nightcore') as any,
            })

            expect(queue.filters.resampler.toggleFilter).toHaveBeenCalledWith(
                'nightcore',
            )
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            description: '🎵 Nightcore disabled',
                        }),
                    ],
                },
            })
        })

        it('reports disabled when the queue has no resampler', async () => {
            ;(queue.filters as { resampler?: unknown }).resampler = undefined

            await execute({
                client: {},
                interaction: createInteraction('nightcore') as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            description: '🎵 Nightcore disabled',
                        }),
                    ],
                },
            })
        })

        it('reports failure when toggling throws', async () => {
            ;(
                queue.filters.resampler.toggleFilter as jest.Mock
            ).mockImplementation(() => {
                throw new Error('resampler unavailable')
            })

            await execute({
                client: {},
                interaction: createInteraction('nightcore') as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Error',
                            description: 'Failed to toggle nightcore effect.',
                        }),
                    ],
                },
            })
        })
    })

    describe('reset', () => {
        it('clears ffmpeg filters and disables nightcore', async () => {
            await execute({
                client: {},
                interaction: createInteraction('reset') as any,
            })

            expect(queue.filters.ffmpeg.setFilters).toHaveBeenCalledWith([])
            expect(queue.filters.resampler.toggleFilter).toHaveBeenCalledWith(
                'nightcore',
            )
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Effects reset',
                            description: '✨ All effects have been cleared.',
                        }),
                    ],
                },
            })
        })

        it('does not crash when the queue has no resampler', async () => {
            ;(queue.filters as { resampler?: unknown }).resampler = undefined

            await execute({
                client: {},
                interaction: createInteraction('reset') as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({ title: 'Effects reset' }),
                    ],
                },
            })
        })

        it('reports failure when clearing filters rejects', async () => {
            ;(
                queue.filters.ffmpeg.setFilters as jest.Mock
            ).mockRejectedValueOnce(new Error('ffmpeg unavailable'))

            await execute({
                client: {},
                interaction: createInteraction('reset') as any,
            })

            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Error',
                            description: 'Failed to reset effects.',
                        }),
                    ],
                },
            })
        })
    })
})
