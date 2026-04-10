import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// Mock discord-player
jest.mock('discord-player', () => ({
    QueryType: { AUTO: 'AUTO', SPOTIFY_SEARCH: 'SPOTIFY_SEARCH', YOUTUBE_SEARCH: 'YOUTUBE_SEARCH' },
}))

// Mock dependencies before importing the command
jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({ title, description: desc })),
    errorEmbed: jest.fn(),
}))

jest.mock('../../../utils/music/nowPlayingEmbed', () => ({
    buildPlayResponseEmbed: jest.fn(() => ({ test: 'embed' })),
}))

jest.mock('../../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: jest.fn(() => ({ test: 'button' })),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../utils/general/errorSanitizer', () => ({
    createUserFriendlyError: jest.fn((error) => 'User friendly error'),
}))

const requireDJRoleMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: jest.fn(),
    requireGuild: jest.fn(),
    requireQueue: jest.fn(),
    requireCurrentTrack: jest.fn(),
    requireIsPlaying: jest.fn(),
    requireInteractionOptions: jest.fn(),
    requireDJRole: (...args: unknown[]) => requireDJRoleMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    createUserErrorMessage: jest.fn(),
    handleError: jest.fn(),
}))

import playTopCommand from './playtop'
import { interactionReply } from '../../../utils/general/interactionReply'
import { buildPlayResponseEmbed } from '../../../utils/music/nowPlayingEmbed'
import { createMusicControlButtons } from '../../../utils/music/buttonComponents'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { requireVoiceChannel } from '../../../utils/command/commandValidations'
import { debugLog, errorLog } from '@lucky/shared/utils'

function createMockInteraction(overrides = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1', username: 'testuser' },
        member: { voice: { channel: { id: 'voice-1' } } },
        options: { getString: jest.fn().mockReturnValue('test query') },
        deferReply: jest.fn(),
        reply: jest.fn(),
        ...overrides,
    }
}

function createMockClient() {
    return {
        player: {
            play: jest.fn(),
        },
    }
}

function createMockQueue(overrides = {}) {
    return {
        tracks: { toArray: jest.fn().mockReturnValue([]) },
        node: { remove: jest.fn() },
        insertTrack: jest.fn(),
        ...overrides,
    }
}

describe('playtop command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireDJRoleMock.mockResolvedValue(true)
    })

    it('should have correct command structure', () => {
        expect(playTopCommand.data.name).toBe('playtop')
        expect(playTopCommand.category).toBe('music')
        expect(playTopCommand.execute).toBeDefined()
    })

    it('should have query string option', () => {
        const options = playTopCommand.data.options
        const queryOption = options.find((opt: any) => opt.name === 'query')
        expect(queryOption).toBeDefined()
        expect(queryOption?.required).toBe(true)
    })

    it('replies with error when guildId is missing', async () => {
        const interaction = createMockInteraction({ guildId: null })

        await playTopCommand.execute({ client: createMockClient(), interaction } as any)

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                ephemeral: true,
                embeds: expect.any(Array),
            }),
        )
    })

    it('returns early when requireVoiceChannel fails', async () => {
        (requireVoiceChannel as jest.Mock).mockResolvedValueOnce(false)
        const client = createMockClient()
        const interaction = createMockInteraction()

        await playTopCommand.execute({ client, interaction } as any)

        expect(client.player.play).not.toHaveBeenCalled()
    })

    it('calls player.play with correct query and search engine', async () => {
        (requireVoiceChannel as jest.Mock).mockResolvedValueOnce(true)
        const client = createMockClient()
        const queue = createMockQueue()
        const interaction = createMockInteraction({ options: { getString: jest.fn().mockReturnValue('spotify:track:abc') } })
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        const mockTrack = { id: 'track-1', title: 'Test Track' }
        client.player.play.mockResolvedValueOnce({
            track: mockTrack,
            searchResult: { playlist: null, tracks: [] },
        })

        await playTopCommand.execute({ client, interaction } as any)

        expect(client.player.play).toHaveBeenCalledWith(
            interaction.member.voice.channel,
            'spotify:track:abc',
            expect.any(Object),
        )
    })

    it('inserts track at position 0 when queue has tracks', async () => {
        (requireVoiceChannel as jest.Mock).mockResolvedValueOnce(true)
        const client = createMockClient()
        const existingTrack = { id: 'track-existing', title: 'Existing' }
        const queue = createMockQueue({
            tracks: { toArray: jest.fn().mockReturnValue([existingTrack]) },
        })
        const interaction = createMockInteraction()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        const mockTrack = { id: 'track-1', title: 'Test Track' }
        client.player.play.mockResolvedValueOnce({
            track: mockTrack,
            searchResult: { playlist: null, tracks: [] },
        })

        await playTopCommand.execute({ client, interaction } as any)

        expect(queue.node.remove).toHaveBeenCalledWith(mockTrack)
        expect(queue.insertTrack).toHaveBeenCalledWith(mockTrack, 0)
    })

    it('does NOT reposition track when queue is empty', async () => {
        (requireVoiceChannel as jest.Mock).mockResolvedValueOnce(true)
        const client = createMockClient()
        const queue = createMockQueue({
            tracks: { toArray: jest.fn().mockReturnValue([]) },
        })
        const interaction = createMockInteraction()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        const mockTrack = { id: 'track-1', title: 'Test Track' }
        client.player.play.mockResolvedValueOnce({
            track: mockTrack,
            searchResult: { playlist: null, tracks: [] },
        })

        await playTopCommand.execute({ client, interaction } as any)

        expect(queue.node.remove).not.toHaveBeenCalled()
        expect(queue.insertTrack).not.toHaveBeenCalled()
    })

    it('shows error embed when player.play throws', async () => {
        (requireVoiceChannel as jest.Mock).mockResolvedValueOnce(true)
        const client = createMockClient()
        const interaction = createMockInteraction()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue: null })

        client.player.play.mockRejectedValueOnce(new Error('Play failed'))

        await playTopCommand.execute({ client, interaction } as any)

        expect(interactionReply).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    ephemeral: true,
                    embeds: expect.any(Array),
                }),
            }),
        )
        expect(errorLog).toHaveBeenCalled()
    })

    it('shows nowPlaying embed on success', async () => {
        (requireVoiceChannel as jest.Mock).mockResolvedValueOnce(true)
        const client = createMockClient()
        const queue = createMockQueue({
            tracks: { toArray: jest.fn().mockReturnValue([]) },
        })
        const interaction = createMockInteraction()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        const mockTrack = { id: 'track-1', title: 'Test Track' }
        client.player.play.mockResolvedValueOnce({
            track: mockTrack,
            searchResult: { playlist: null, tracks: [] },
        })

        await playTopCommand.execute({ client, interaction } as any)

        expect(buildPlayResponseEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'addedToQueue',
                track: mockTrack,
                queuePosition: 1,
            }),
        )
        expect(interactionReply).toHaveBeenCalled()
    })
})
