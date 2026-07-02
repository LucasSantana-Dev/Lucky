// Mock the dependencies FIRST - before any imports
const mockWarnLog = jest.fn()
const mockDebugLog = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: mockDebugLog,
    errorLog: jest.fn(),
    warnLog: mockWarnLog,
    infoLog: jest.fn(),
    successLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    constants: {
        MAX_AUTOPLAY_TRACKS: 50,
    },
}))

jest.mock('../../utils/general/embeds', () => ({
    createEmbed: jest.fn(),
    EMBED_COLORS: { MUSIC: '#FF0000' },
}))

jest.mock('../../utils/music/autoplayManager', () => ({
    getAutoplayCount: jest.fn(),
}))

jest.mock('../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: jest.fn(),
    createMusicActionButtons: jest.fn(),
}))

jest.mock('../../utils/music/autoplay/autoplayAcceptanceCache', () => ({
    getPerSourceAcceptanceRateCached: jest.fn(),
}))

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: jest.fn(),
    getSessionKeyForUser: jest.fn(),
    getTrackMetadata: jest.fn(),
    updateNowPlaying: jest.fn(),
    scrobble: jest.fn(),
}))

jest.mock('../../utils/music/skipReasonMap', () => ({
    getSkipReasonEmojis: jest.fn(() => ['👎', '😴', '🎸', '🔁']),
}))

// NOW import types and the module under test after mocks are set up
import {
    describe,
    expect,
    it,
    beforeEach,
} from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { TextChannel, Guild, Message } from 'discord.js'
import { sendNowPlayingEmbed } from './trackNowPlaying'

describe('trackNowPlaying - emoji prefill logging', () => {
    let mockQueue: Partial<GuildQueue>
    let mockTrack: Partial<Track>
    let mockGuild: Partial<Guild>
    let mockChannel: Partial<TextChannel>
    let mockMessage: Partial<Message>

    beforeEach(() => {
        jest.clearAllMocks()

        // Set up default mock guild
        mockGuild = {
            id: 'guild-123',
        }

        // Set up default mock channel
        mockChannel = {
            id: 'channel-456',
            send: jest.fn(),
        }

        // Set up default mock message
        mockMessage = {
            id: 'message-789',
            react: jest.fn().mockResolvedValue(undefined),
            edit: jest.fn().mockResolvedValue(undefined),
        }

        // Set up default mock track
        mockTrack = {
            title: 'Test Track',
            author: 'Test Artist',
            url: 'https://example.com/track',
            thumbnail: 'https://example.com/thumb.png',
            duration: '3:30',
            durationMS: 210000,
            requestedBy: null,
        }

        // Set up default mock queue
        mockQueue = {
            guild: mockGuild as Guild,
            metadata: {
                channel: mockChannel as TextChannel,
            },
            currentTrack: mockTrack as Track,
        }

        // Default: all emoji reactions succeed
        ;(mockChannel.send as jest.Mock).mockResolvedValue(mockMessage)
    })

    it('logs once per guild when emoji prefill fails', async () => {
        const reactError = new Error('Missing Permissions')
        ;(reactError as any).code = 50013
        ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

        // First call for guild-123
        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)

        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to prefill skip-reason emojis'),
                data: expect.objectContaining({
                    guildId: 'guild-123',
                    errorCode: 50013,
                }),
            }),
        )
    })

    it('does not log duplicate warnings for same guild in session', async () => {
        const reactError = new Error('Missing Permissions')
        ;(reactError as any).code = 50013
        ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

        // First call for guild-123
        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)
        mockWarnLog.mockClear()

        // Second call for guild-123 should NOT log again
        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)

        expect(mockWarnLog).not.toHaveBeenCalled()
    })

    it('logs partial emoji prefill as debug message', async () => {
        let callCount = 0
        ;(mockMessage.react as jest.Mock).mockImplementation(() => {
            callCount++
            // Fail on first emoji (👎), succeed on others
            if (callCount === 1) {
                return Promise.reject(new Error('Missing Permissions'))
            }
            return Promise.resolve(undefined)
        })

        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)

        // Should log the partial prefill
        expect(mockDebugLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Partial emoji prefill'),
                data: expect.objectContaining({
                    guildId: 'guild-123',
                    successCount: 3,
                    attemptedCount: 4,
                }),
            }),
        )
    })

    it('includes emoji prefill stats in now-playing message debug log', async () => {
        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)

        expect(mockDebugLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Sent now playing message to channel',
                data: expect.objectContaining({
                    guildId: 'guild-123',
                    emojiPrefill: expect.objectContaining({
                        successCount: 4,
                        attemptedCount: 4,
                        allSuccessful: true,
                    }),
                }),
            }),
        )
    })

    it('handles emoji prefill failure gracefully without throwing', async () => {
        ;(mockMessage.react as jest.Mock).mockRejectedValue(
            new Error('Missing Permissions'),
        )

        // Should not throw even if all emoji reactions fail
        await expect(
            sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false),
        ).resolves.not.toThrow()
    })

    it('extracts error code from discord error object', async () => {
        const reactError = new Error('Missing Permissions')
        ;(reactError as any).code = 50013
        ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)

        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    errorCode: 50013,
                }),
            }),
        )
    })

    it('extracts error code from error message when not in code property', async () => {
        const reactError = new Error('Discord API error 50013')
        ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)

        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    errorCode: '50013',
                }),
            }),
        )
    })

    it('updates existing message with emoji reactions and logs stats', async () => {
        // Mock existing message scenario
        const mockExistingMessage = {
            id: 'existing-message-id',
            edit: jest.fn().mockResolvedValue(undefined),
            react: jest.fn().mockResolvedValue(undefined),
        }
        ;(mockChannel.messages as any) = {
            fetch: jest.fn().mockResolvedValue(mockExistingMessage),
        }

        await sendNowPlayingEmbed(mockQueue as GuildQueue, mockTrack as Track, false)

        // Should have logged updated message
        expect(mockDebugLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Updated now playing message in channel',
            }),
        )
    })
})
