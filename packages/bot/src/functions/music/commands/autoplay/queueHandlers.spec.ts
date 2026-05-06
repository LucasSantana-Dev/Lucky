import { jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'

const mockInteractionReply = jest.fn().mockResolvedValue(undefined)
const mockReplenishQueue = jest.fn().mockResolvedValue(undefined)
const mockCreateEmbed = jest.fn().mockReturnValue({ type: 'embed' })
const mockCreateErrorEmbed = jest.fn().mockReturnValue({ type: 'error-embed' })
const mockDebugLog = jest.fn()
const mockGetByDiscordId = jest.fn()

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => mockInteractionReply(...args),
}))

jest.mock('../../../../utils/music/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => mockReplenishQueue(...args),
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => mockCreateEmbed(...args),
    createErrorEmbed: (...args: unknown[]) => mockCreateErrorEmbed(...args),
    EMBED_COLORS: { AUTOPLAY: '#7289DA', ERROR: '#FF0000' },
    EMOJIS: { AUTOPLAY: '📻' },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => mockDebugLog(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => mockGetByDiscordId(...args),
    },
}))

import {
    isAutoplayTrack,
    handleAutoplayStatus,
    handleSkipAutoplayTrack,
    handleClearAutoplayTracks,
} from './queueHandlers'

function makeTrack(isAutoplay: boolean): object {
    return {
        title: isAutoplay ? 'autoplay-track' : 'user-track',
        metadata: isAutoplay ? { isAutoplay: true } : {},
    }
}

function makeQueue(
    tracks: object[],
    metadata: object = {},
    repeatMode = 0,
): GuildQueue {
    return {
        tracks: {
            size: tracks.length,
            at: (i: number) => tracks[i],
        },
        metadata,
        repeatMode,
        guild: { id: 'guild-123' },
        removeTrack: jest.fn(),
    } as unknown as GuildQueue
}

function makeInteraction(overrides: object = {}): ChatInputCommandInteraction {
    return {
        guildId: 'guild-123',
        user: { id: 'user-1' },
        ...overrides,
    } as unknown as ChatInputCommandInteraction
}

describe('isAutoplayTrack', () => {
    it('returns true when metadata.isAutoplay is true', () => {
        expect(isAutoplayTrack({ metadata: { isAutoplay: true } })).toBe(true)
    })

    it('returns false when metadata.isAutoplay is absent', () => {
        expect(isAutoplayTrack({ metadata: {} })).toBe(false)
    })

    it('returns false for null track', () => {
        expect(isAutoplayTrack(null)).toBe(false)
    })
})

describe('handleAutoplayStatus', () => {
    const interaction = makeInteraction()

    it('shows enabled status and correct autoplay track count', async () => {
        const queue = makeQueue(
            [makeTrack(true), makeTrack(false), makeTrack(true)],
            { vcMemberIds: [] },
            2, // repeatMode 2 = autoplay enabled
        )
        mockCreateEmbed.mockReturnValueOnce({ title: 'status-embed' })

        await handleAutoplayStatus(interaction, queue)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                title: '📻 Autoplay Status',
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: '📊 Queue', value: '2 / 3 tracks' }),
                    expect.objectContaining({ name: '🎵 Status', value: expect.stringContaining('Enabled') }),
                ]),
            }),
        )
    })

    it('shows disabled status when repeatMode is not 2', async () => {
        const queue = makeQueue([makeTrack(false)], { vcMemberIds: [] }, 0)

        await handleAutoplayStatus(interaction, queue)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: '🎵 Status', value: 'Disabled' }),
                ]),
            }),
        )
    })

    it('shows zero autoplay tracks on empty queue', async () => {
        const queue = makeQueue([], { vcMemberIds: [] }, 2)

        await handleAutoplayStatus(interaction, queue)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                fields: expect.arrayContaining([
                    expect.objectContaining({ name: '📊 Queue', value: '0 / 0 tracks' }),
                ]),
            }),
        )
    })

    it('does not add Blend field when only one vc member', async () => {
        const queue = makeQueue(
            [makeTrack(true)],
            { vcMemberIds: ['user-1'] },
            2,
        )

        await handleAutoplayStatus(interaction, queue)

        const call = mockCreateEmbed.mock.calls[0][0] as { fields: Array<{ name: string }> }
        const blendField = call.fields.find((f) => f.name === '🎭 Blend')
        expect(blendField).toBeUndefined()
    })

    it('adds Blend field when multiple vc members have Last.fm links', async () => {
        const queue = makeQueue(
            [makeTrack(true)],
            { vcMemberIds: ['user-1', 'user-2'] },
            2,
        )
        mockGetByDiscordId
            .mockResolvedValueOnce({ lastFmUsername: 'alice' })
            .mockResolvedValueOnce({ lastFmUsername: 'bob' })

        await handleAutoplayStatus(interaction, queue)

        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({
                fields: expect.arrayContaining([
                    expect.objectContaining({
                        name: '🎭 Blend',
                        value: 'Mixing taste for 2 users',
                    }),
                ]),
            }),
        )
    })

    it('does not add Blend field when vc members lack Last.fm links', async () => {
        const queue = makeQueue(
            [makeTrack(true)],
            { vcMemberIds: ['user-1', 'user-2'] },
            2,
        )
        mockGetByDiscordId
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)

        await handleAutoplayStatus(interaction, queue)

        const call = mockCreateEmbed.mock.calls[0][0] as { fields: Array<{ name: string }> }
        const blendField = call.fields.find((f) => f.name === '🎭 Blend')
        expect(blendField).toBeUndefined()
    })

    it('handles null metadata without throwing', async () => {
        const queue = makeQueue([makeTrack(true)], null, 2)

        await expect(handleAutoplayStatus(interaction, queue)).resolves.not.toThrow()
    })
})

describe('handleSkipAutoplayTrack', () => {
    const interaction = makeInteraction()

    it('replies with error when queue is empty', async () => {
        const queue = makeQueue([])
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleSkipAutoplayTrack(interaction, queue)

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith('Queue Empty', expect.any(String))
        expect(mockReplenishQueue).not.toHaveBeenCalled()
    })

    it('replies with error when no autoplay tracks exist', async () => {
        const queue = makeQueue([makeTrack(false), makeTrack(false)])
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleSkipAutoplayTrack(interaction, queue)

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith('No Autoplay Tracks', expect.any(String))
        expect(mockReplenishQueue).not.toHaveBeenCalled()
    })

    it('removes first autoplay track and replenishes queue', async () => {
        const tracks = [makeTrack(false), makeTrack(true), makeTrack(true)]
        const queue = makeQueue(tracks)
        mockCreateEmbed.mockReturnValueOnce({ type: 'success' })

        await handleSkipAutoplayTrack(interaction, queue)

        expect((queue as any).removeTrack).toHaveBeenCalledWith(1)
        expect(mockReplenishQueue).toHaveBeenCalledWith(queue)
    })
})

describe('handleClearAutoplayTracks', () => {
    const interaction = makeInteraction()

    it('replies with error when no autoplay tracks exist', async () => {
        const queue = makeQueue([makeTrack(false)])
        mockCreateErrorEmbed.mockReturnValueOnce({ type: 'error' })

        await handleClearAutoplayTracks(interaction, queue)

        expect(mockCreateErrorEmbed).toHaveBeenCalledWith('No Autoplay Tracks', expect.any(String))
        expect(mockReplenishQueue).not.toHaveBeenCalled()
    })

    it('removes all autoplay tracks in reverse order and replenishes', async () => {
        const tracks = [makeTrack(true), makeTrack(false), makeTrack(true)]
        const queue = makeQueue(tracks)
        mockCreateEmbed.mockReturnValueOnce({ type: 'success' })

        await handleClearAutoplayTracks(interaction, queue)

        // Removed in reverse: index 2 first, then index 0
        expect((queue as any).removeTrack).toHaveBeenNthCalledWith(1, 2)
        expect((queue as any).removeTrack).toHaveBeenNthCalledWith(2, 0)
        expect(mockReplenishQueue).toHaveBeenCalledWith(queue)
        expect(mockCreateEmbed).toHaveBeenCalledWith(
            expect.objectContaining({ description: expect.stringContaining('2 autoplay tracks') }),
        )
    })
})
