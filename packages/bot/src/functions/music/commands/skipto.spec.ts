import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: jest.fn(async () => true),
    requireQueue: jest.fn(async () => true),
    requireVoiceChannel: jest.fn(async () => true),
    requireDJRoleInGuild: jest.fn(async () => true),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildCommandTrackEmbed: jest.fn(() => ({ title: 'track-embed' })),
}))

import skiptoCommand from './skipto'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireGuild,
    requireQueue,
    requireVoiceChannel,
    requireDJRoleInGuild,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'

const createQueue = (tracks: { title: string }[]) => ({
    tracks: {
        size: tracks.length,
        toArray: jest.fn(() => tracks),
    },
    node: { skipTo: jest.fn() },
})

const createInteraction = (position: number) => ({
    guildId: 'guild-1',
    user: { id: 'user-1' },
    options: { getInteger: jest.fn(() => position) },
})

const execute = skiptoCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('skipto command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireGuild as jest.Mock).mockResolvedValue(true)
        ;(requireVoiceChannel as jest.Mock).mockResolvedValue(true)
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(true)
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
    })

    it('stops before resolving a queue when not in a guild', async () => {
        ;(requireGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction(1) as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when the caller is not in a voice channel', async () => {
        ;(requireVoiceChannel as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction(1) as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when the caller lacks the DJ role', async () => {
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction(1) as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when there is no active queue', async () => {
        ;(requireQueue as jest.Mock).mockResolvedValue(false)
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })

        await execute({
            client: {},
            interaction: createInteraction(1) as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('rejects a position beyond queue size + 1', async () => {
        const queue = createQueue([{ title: 'a' }, { title: 'b' }])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction(4) as any,
        })

        expect(queue.node.skipTo).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Invalid position',
                        description:
                            'Queue has 2 tracks. Position must be between 1 and 3.',
                    }),
                ],
                ephemeral: true,
            },
        })
    })

    it('accepts a position exactly at queue size + 1', async () => {
        const queue = createQueue([{ title: 'a' }])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction(2) as any,
        })

        expect(queue.node.skipTo).toHaveBeenCalledWith(1)
    })

    it('skips to the target index and replies generically when no track is there', async () => {
        const queue = createQueue([{ title: 'a' }])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction(2) as any,
        })

        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: '⏭️ Skipped',
                        description: 'Skipped to position 2.',
                    }),
                ],
            },
        })
    })

    it('skips to the target index and replies with the target track embed', async () => {
        const targetTrack = { title: 'Target Song' }
        const queue = createQueue([{ title: 'a' }, targetTrack, { title: 'c' }])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await execute({
            client: {},
            interaction: createInteraction(2) as any,
        })

        expect(queue.node.skipTo).toHaveBeenCalledWith(1)
        expect(buildCommandTrackEmbed).toHaveBeenCalledWith(
            targetTrack,
            '⏭️ Now playing (position 2)',
            expect.objectContaining({ id: 'user-1' }),
        )
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: { embeds: [{ title: 'track-embed' }] },
        })
    })
})
