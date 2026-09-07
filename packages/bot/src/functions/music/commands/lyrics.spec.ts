import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

const createEmbedStub = () => {
    const embed = { setFooter: jest.fn() }
    embed.setFooter.mockReturnValue(embed)
    return embed
}

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createWarningEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    musicEmbed: jest.fn(() => createEmbedStub()),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireCurrentTrack: jest.fn(async () => true),
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: { isEnabled: jest.fn(async () => true) },
    lyricsService: {
        searchLyrics: jest.fn(),
        splitLyrics: jest.fn((lyrics: string) => [lyrics]),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

import lyricsCommand from './lyrics'
import { interactionReply } from '../../../utils/general/interactionReply'
import { musicEmbed } from '../../../utils/general/embeds'
import { requireCurrentTrack } from '../../../utils/command/commandValidations'
import { featureToggleService, lyricsService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

const createInteraction = (
    song: string | null,
    guildId: string | null = 'guild-1',
) => ({
    guildId,
    user: { id: 'user-1' },
    options: { getString: jest.fn(() => song) },
    deferReply: jest.fn(async () => undefined),
    followUp: jest.fn(async () => undefined),
})

const execute = lyricsCommand.execute as (params: {
    client: unknown
    interaction: ReturnType<typeof createInteraction>
}) => Promise<void>

describe('lyrics command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(true)
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(true)
        ;(lyricsService.splitLyrics as jest.Mock).mockImplementation(
            (lyrics: string) => [lyrics],
        )
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { currentTrack: { title: 'Song A', author: 'Artist A' } },
        })
    })

    it('reports the feature as unavailable when the toggle is off', async () => {
        ;(featureToggleService.isEnabled as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction('Song A') as any,
        })

        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Feature unavailable',
                    }),
                ],
                ephemeral: true,
            },
        })
        expect(lyricsService.searchLyrics).not.toHaveBeenCalled()
    })

    it('rejects a blank query outside a guild', async () => {
        const interaction = createInteraction('', null)

        await execute({ client: {}, interaction: interaction as any })

        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [expect.objectContaining({ title: 'Server only' })],
                ephemeral: true,
            },
        })
        expect(resolveGuildQueue).not.toHaveBeenCalled()
    })

    it('stops when there is no current track and no query was given', async () => {
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(false)

        await execute({
            client: {},
            interaction: createInteraction(null) as any,
        })

        expect(lyricsService.searchLyrics).not.toHaveBeenCalled()
    })

    it('falls back to the currently playing track when no query is given', async () => {
        ;(lyricsService.searchLyrics as jest.Mock).mockResolvedValue({
            title: 'Song A',
            lyrics: 'la la la',
            source: 'Genius',
        })

        await execute({
            client: {},
            interaction: createInteraction(null) as any,
        })

        expect(lyricsService.searchLyrics).toHaveBeenCalledWith(
            'Song A',
            'Artist A',
        )
    })

    it('uses "Unknown" title when the current track has no title', async () => {
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { currentTrack: { title: undefined, author: undefined } },
        })
        ;(lyricsService.searchLyrics as jest.Mock).mockResolvedValue({
            title: 'Song A',
            lyrics: 'la la la',
            source: 'Genius',
        })

        await execute({
            client: {},
            interaction: createInteraction(null) as any,
        })

        expect(lyricsService.searchLyrics).toHaveBeenCalledWith(
            'Unknown',
            undefined,
        )
    })

    it('searches by the explicit query without touching the queue', async () => {
        ;(lyricsService.searchLyrics as jest.Mock).mockResolvedValue({
            title: 'Bohemian Rhapsody',
            lyrics: 'la la la',
            source: 'Genius',
        })

        await execute({
            client: {},
            interaction: createInteraction('Queen - Bohemian Rhapsody') as any,
        })

        expect(resolveGuildQueue).not.toHaveBeenCalled()
        expect(lyricsService.searchLyrics).toHaveBeenCalledWith(
            'Queen - Bohemian Rhapsody',
            undefined,
        )
    })

    it('replies with a not-found error when the service returns an error result', async () => {
        ;(lyricsService.searchLyrics as jest.Mock).mockResolvedValue({
            error: true,
            message: 'No lyrics found for this song.',
        })

        await execute({
            client: {},
            interaction: createInteraction('Unknown Song') as any,
        })

        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [
                    expect.objectContaining({
                        title: 'Lyrics not found',
                        description: 'No lyrics found for this song.',
                    }),
                ],
            },
        })
    })

    it('replies with a single page and no follow-ups when lyrics fit on one page', async () => {
        ;(lyricsService.searchLyrics as jest.Mock).mockResolvedValue({
            title: 'Song A',
            lyrics: 'la la la',
            source: 'Genius',
        })
        ;(lyricsService.splitLyrics as jest.Mock).mockReturnValue(['la la la'])

        const interaction = createInteraction('Song A')
        await execute({ client: {}, interaction: interaction as any })

        expect(interaction.deferReply).toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith({
            interaction,
            content: { embeds: [expect.anything()] },
        })
        expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it('sends the remaining pages as follow-ups when lyrics span multiple pages', async () => {
        ;(lyricsService.searchLyrics as jest.Mock).mockResolvedValue({
            title: 'Song A',
            lyrics: 'very long lyrics',
            source: 'Genius',
        })
        ;(lyricsService.splitLyrics as jest.Mock).mockReturnValue([
            'page 1',
            'page 2',
            'page 3',
        ])

        const interaction = createInteraction('Song A')
        await execute({ client: {}, interaction: interaction as any })

        expect(interactionReply).toHaveBeenCalledTimes(1)
        expect(interaction.followUp).toHaveBeenCalledTimes(2)
        expect(musicEmbed).toHaveBeenNthCalledWith(
            1,
            'Lyrics — Song A',
            'page 1',
        )
        expect(musicEmbed).toHaveBeenNthCalledWith(
            2,
            'Lyrics — Song A',
            'page 2',
        )
        expect(musicEmbed).toHaveBeenNthCalledWith(
            3,
            'Lyrics — Song A',
            'page 3',
        )
    })

    it('reports a generic error and logs it when the lyrics lookup throws', async () => {
        ;(lyricsService.searchLyrics as jest.Mock).mockRejectedValue(
            new Error('provider timeout'),
        )

        await execute({
            client: {},
            interaction: createInteraction('Song A') as any,
        })

        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to fetch lyrics',
            }),
        )
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: expect.anything(),
            content: {
                embeds: [expect.objectContaining({ title: 'Lyrics error' })],
            },
        })
    })
})
