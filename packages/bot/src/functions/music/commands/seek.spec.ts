import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: jest.fn(async () => true),
    requireCurrentTrack: jest.fn(async () => true),
    requireIsPlaying: jest.fn(async () => true),
    requireVoiceChannel: jest.fn(async () => true),
    requireDJRoleInGuild: jest.fn(async () => true),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: jest.fn(() => ({ title: 'track-embed' })),
}))

import seekCommand from './seek'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
    requireVoiceChannel,
    requireDJRoleInGuild,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'

const createQueue = (currentTrack: unknown) => ({
    currentTrack,
    node: { seek: jest.fn() },
})

const createInteraction = (time: string) => ({
    guildId: 'guild-1',
    user: { id: 'user-1' },
    options: { getString: jest.fn(() => time) },
})

const execute = seekCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('seek command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireVoiceChannel as jest.Mock).mockResolvedValue(true)
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(true)
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(true)
        ;(requireIsPlaying as jest.Mock).mockResolvedValue(true)
    })

    it('stops before resolving a queue when not in a voice channel', async () => {
        ;(requireVoiceChannel as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('1:30') as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when the caller lacks the DJ role', async () => {
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('1:30') as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when there is no active queue', async () => {
        ;(requireQueue as jest.Mock).mockResolvedValue(false)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })

        await execute({
            client: {},
            interaction: createInteraction('1:30') as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('stops when there is no current track', async () => {
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(false)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: createQueue(null),
        })

        await execute({
            client: {},
            interaction: createInteraction('1:30') as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('stops when nothing is playing', async () => {
        ;(requireIsPlaying as jest.Mock).mockResolvedValue(false)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: createQueue({ durationMS: 180_000 }),
        })

        await execute({
            client: {},
            interaction: createInteraction('1:30') as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it.each(['abc', '1:60', '-5', '1:2:3'])(
        'rejects an unparseable time string %j',
        async (timeStr) => {
            const queue = createQueue({ durationMS: 180_000 })
            ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

            await execute({
                client: {},
                interaction: createInteraction(timeStr) as any,
            })

            expect(queue.node.seek).not.toHaveBeenCalled()
            expect(interactionReply).toHaveBeenCalledWith({
                interaction: expect.anything(),
                content: {
                    embeds: [
                        expect.objectContaining({
                            title: 'Invalid time format',
                        }),
                    ],
                    ephemeral: true,
                },
            })
        },
    )

    it.each([
        ['90', 90_000],
        ['1:30', 90_000],
        ['0:05', 5_000],
    ])('parses %s as %i ms', async (timeStr, expectedMs) => {
        const queue = createQueue({ durationMS: 200_000 })
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction(timeStr) as any,
        })

        expect(queue.node.seek).toHaveBeenCalledWith(expectedMs)
    })

    it('rejects seeking on a track with no known duration', async () => {
        const queue = createQueue({ durationMS: 0 })
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction('1:00') as any,
        })

        expect(queue.node.seek).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Cannot seek',
                    }),
                ],
                ephemeral: true,
            },
        })
    })

    it('rejects a target time beyond the track duration', async () => {
        const queue = createQueue({ durationMS: 60_000 })
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction('2:00') as any,
        })

        expect(queue.node.seek).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Time out of range',
                        description: 'Track duration is 1:00',
                    }),
                ],
                ephemeral: true,
            },
        })
    })

    it('seeks and replies with the formatted time and track embed', async () => {
        const currentTrack = { durationMS: 180_000 }
        const queue = createQueue(currentTrack)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction('1:05') as any,
        })

        expect(queue.node.seek).toHaveBeenCalledWith(65_000)
        expect(buildCommandTrackEmbed).toHaveBeenCalledWith(
            currentTrack,
            '⏩ Seeked to 1:05',
            expect.objectContaining({ id: 'user-1' }),
        )
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: { embeds: [{ title: 'track-embed' }] },
        })
    })
})
