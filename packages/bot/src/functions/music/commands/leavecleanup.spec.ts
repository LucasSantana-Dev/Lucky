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
    requireDJRoleInGuild: jest.fn(async () => true),
    requireQueue: jest.fn(async () => true),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('@lucky/shared/utils/guards', () => ({
    assertDefined: jest.fn((value: unknown) => value),
}))

import leavecleanupCommand from './leavecleanup'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireGuild,
    requireDJRoleInGuild,
    requireQueue,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

const createTrack = (id: string, requesterId: string | undefined) => ({
    id,
    requestedBy: requesterId ? { id: requesterId } : undefined,
})

const createQueue = (trackList: ReturnType<typeof createTrack>[]) => ({
    channel: { members: new Map([['present-user', {}]]) },
    tracks: { toArray: jest.fn(() => trackList) },
    node: { remove: jest.fn() },
})

const createInteraction = () => ({ guildId: 'guild-1' })

const execute = leavecleanupCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('leavecleanup command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireGuild as jest.Mock).mockResolvedValue(true)
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(true)
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
    })

    it('stops before resolving a queue when not in a guild', async () => {
        ;(requireGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when the caller lacks the DJ role', async () => {
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when there is no active queue', async () => {
        ;(requireQueue as jest.Mock).mockResolvedValue(false)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('reports an error when the bot has no voice channel', async () => {
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { channel: null, tracks: { toArray: jest.fn() } },
        })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Error',
                        description: 'Bot is not in a voice channel.',
                    }),
                ],
            },
        })
    })

    it('removes tracks requested by members no longer in the channel', async () => {
        const staleTrack = createTrack('t1', 'left-user')
        const queue = createQueue([staleTrack])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(queue.node.remove).toHaveBeenCalledWith(staleTrack)
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        description: '🧹 Removed 1 track from members who left',
                    }),
                ],
            },
        })
    })

    it('pluralizes the removed-track count', async () => {
        const queue = createQueue([
            createTrack('t1', 'left-user-1'),
            createTrack('t2', 'left-user-2'),
        ])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        description:
                            '🧹 Removed 2 tracks from members who left',
                    }),
                ],
            },
        })
    })

    it('keeps tracks requested by members still present in the channel', async () => {
        const presentTrack = createTrack('t1', 'present-user')
        const queue = createQueue([presentTrack])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(queue.node.remove).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        description:
                            '✅ No tracks to clean up — all requesters are still in the channel',
                    }),
                ],
            },
        })
    })

    it('keeps tracks with no requester (system/queued-without-attribution)', async () => {
        const orphanTrack = createTrack('t1', undefined)
        const queue = createQueue([orphanTrack])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(queue.node.remove).not.toHaveBeenCalled()
    })

    it('continues past a track that throws on removal', async () => {
        const track1 = createTrack('t1', 'left-user-1')
        const track2 = createTrack('t2', 'left-user-2')
        const queue = createQueue([track1, track2])
        ;(queue.node.remove as jest.Mock).mockImplementationOnce(() => {
            throw new Error('already removed')
        })
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(queue.node.remove).toHaveBeenCalledTimes(2)
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        description: '🧹 Removed 1 track from members who left',
                    }),
                ],
            },
        })
    })
})
