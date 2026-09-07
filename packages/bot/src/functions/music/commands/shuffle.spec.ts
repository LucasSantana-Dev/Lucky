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

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: jest.fn(async () => true),
    requireQueue: jest.fn(async () => true),
    requireCurrentTrack: jest.fn(async () => true),
    requireVoiceChannel: jest.fn(async () => true),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../utils/music/queue/smartShuffle', () => ({
    smartShuffle: jest.fn((tracks: unknown[]) => tracks),
}))

jest.mock('@lucky/shared/utils/env', () => ({
    parseIntEnv: jest.fn(() => 2),
}))

jest.mock('@lucky/shared/utils/guards', () => ({
    assertDefined: jest.fn((value: unknown) => value),
}))

import shuffleCommand from './shuffle'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
    requireVoiceChannel,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { smartShuffle } from '../../../utils/music/queue/smartShuffle'

const createQueue = (size: number, trackList: unknown[] = []) => ({
    tracks: {
        size,
        shuffle: jest.fn(),
        toArray: jest.fn(() => trackList),
        clear: jest.fn(),
        add: jest.fn(),
    },
})

const createInteraction = (subcommand: string | null) => ({
    guildId: 'guild-1',
    options: { getSubcommand: jest.fn(() => subcommand) },
})

const execute = shuffleCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('shuffle command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireGuild as jest.Mock).mockResolvedValue(true)
        ;(requireVoiceChannel as jest.Mock).mockResolvedValue(true)
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(true)
    })

    it('stops before resolving a queue when not in a guild', async () => {
        ;(requireGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('random') as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when the caller is not in a voice channel', async () => {
        ;(requireVoiceChannel as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('random') as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when there is no active queue', async () => {
        ;(requireQueue as jest.Mock).mockResolvedValue(false)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })

        await execute({
            client: {},
            interaction: createInteraction('random') as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('stops when there is no current track', async () => {
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(false)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: createQueue(5),
        })

        await execute({
            client: {},
            interaction: createInteraction('random') as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('rejects shuffling a queue with fewer than 2 tracks', async () => {
        const queue = createQueue(1)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction('random') as any,
        })

        expect(queue.tracks.shuffle).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        description:
                            'The queue needs at least 2 songs to be shuffled!',
                    }),
                ],
            },
        })
    })

    it('defaults to random shuffle when no subcommand is given', async () => {
        const queue = createQueue(3)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction(null) as any,
        })

        expect(queue.tracks.shuffle).toHaveBeenCalled()
        expect(smartShuffle).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Queue shuffled',
                    }),
                ],
            },
        })
    })

    it('randomly shuffles via queue.tracks.shuffle for the random subcommand', async () => {
        const queue = createQueue(3)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction('random') as any,
        })

        expect(queue.tracks.shuffle).toHaveBeenCalled()
        expect(smartShuffle).not.toHaveBeenCalled()
    })

    it('smart-shuffles by clearing and re-adding tracks in the shuffled order', async () => {
        const trackA = { id: 'a' }
        const trackB = { id: 'b' }
        const queue = createQueue(2, [trackA, trackB])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })
        ;(smartShuffle as jest.Mock).mockReturnValue([trackB, trackA])

        await execute({
            client: {},
            interaction: createInteraction('smart') as any,
        })

        expect(smartShuffle).toHaveBeenCalledWith(
            [trackA, trackB],
            expect.objectContaining({ streakLimit: 2 }),
        )
        expect(queue.tracks.clear).toHaveBeenCalled()
        expect(queue.tracks.add).toHaveBeenNthCalledWith(1, trackB)
        expect(queue.tracks.add).toHaveBeenNthCalledWith(2, trackA)
        expect(queue.tracks.shuffle).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Queue smart-shuffled',
                    }),
                ],
            },
        })
    })
})
