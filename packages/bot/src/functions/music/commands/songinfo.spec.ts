import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildTrackEmbed: jest.fn(() => ({ title: 'track-embed' })),
    playerTrackToData: jest.fn((track: unknown) => ({ from: track })),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: jest.fn(async () => true),
    requireCurrentTrack: jest.fn(async () => true),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('@lucky/shared/utils/guards', () => ({
    assertDefined: jest.fn((value: unknown) => value),
}))

import songinfoCommand from './songinfo'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    buildTrackEmbed,
    playerTrackToData,
} from '../../../utils/general/responseEmbeds'
import {
    requireQueue,
    requireCurrentTrack,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

const createInteraction = () => ({
    guildId: 'guild-1',
    user: {
        username: 'tester',
        displayAvatarURL: jest.fn(() => 'https://cdn.example/avatar.png'),
    },
})

const execute = songinfoCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('songinfo command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(true)
    })

    it('stops when there is no active queue', async () => {
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })
        ;(requireQueue as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('stops when there is no current track', async () => {
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { currentTrack: null },
        })
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('replies with a track embed including a progress bar when duration is known', async () => {
        const track = { title: 'Song A' }
        const createProgressBar = jest.fn(() => '▬▬🔘▬▬ 1:00/3:00')
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: {
                currentTrack: track,
                node: { createProgressBar },
            },
        })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(createProgressBar).toHaveBeenCalledWith({
            length: 18,
            timecodes: true,
        })
        expect(playerTrackToData).toHaveBeenCalledWith(track)
        expect(buildTrackEmbed).toHaveBeenCalledWith(
            { from: track },
            'playing',
            expect.objectContaining({ tag: 'tester' }),
            { progressBar: '▬▬🔘▬▬ 1:00/3:00' },
        )
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: { embeds: [{ title: 'track-embed' }] },
        })
    })

    it('replies with a null progress bar for a livestream/no-duration track', async () => {
        const track = { title: 'Live Stream' }
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: {
                currentTrack: track,
                node: { createProgressBar: jest.fn(() => null) },
            },
        })

        await execute({
            client: {},
            interaction: createInteraction() as any,
        })

        expect(buildTrackEmbed).toHaveBeenCalledWith(
            { from: track },
            'playing',
            expect.anything(),
            { progressBar: null },
        )
    })
})
