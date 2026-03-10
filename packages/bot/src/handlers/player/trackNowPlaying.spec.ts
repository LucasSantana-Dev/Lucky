import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { sendNowPlayingEmbed } from './trackNowPlaying'

const debugLogMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const getAutoplayCountMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: jest.fn(),
}))

jest.mock('../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    EMBED_COLORS: { MUSIC: '#123456' },
}))

jest.mock('../../utils/music/autoplayManager', () => ({
    getAutoplayCount: (...args: unknown[]) => getAutoplayCountMock(...args),
}))

jest.mock('@lucky/shared/config', () => ({
    constants: { MAX_AUTOPLAY_TRACKS: 50 },
}))

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: jest.fn(() => false),
    getSessionKeyForUser: jest.fn(),
    updateNowPlaying: jest.fn(),
    scrobble: jest.fn(),
}))

function createQueue(guildId: string) {
    const message = {
        id: 'message-1',
        edit: jest.fn().mockResolvedValue(undefined),
    }
    const channel = {
        id: 'channel-1',
        send: jest.fn().mockResolvedValue(message),
        messages: {
            fetch: jest.fn().mockResolvedValue(message),
        },
    }
    return {
        queue: {
            guild: { id: guildId },
            metadata: { channel },
            currentTrack: null,
            tracks: { at: jest.fn(() => null) },
        },
        channel,
    }
}

describe('sendNowPlayingEmbed', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getAutoplayCountMock.mockResolvedValue(7)
    })

    it('adds autoplay reason field and footer progress for autoplay tracks', async () => {
        const { queue, channel } = createQueue('guild-1')
        const track = {
            title: 'Song A',
            author: 'Artist A',
            url: 'https://example.com/a',
            duration: '3:00',
            thumbnail: 'https://example.com/thumb.jpg',
            requestedBy: { username: 'bot' },
            metadata: { recommendationReason: 'fresh artist rotation' },
        }

        await sendNowPlayingEmbed(queue as any, track as any, true)

        expect(getAutoplayCountMock).toHaveBeenCalledWith('guild-1')
        expect(createEmbedMock).toHaveBeenCalledWith(
            expect.objectContaining({
                fields: expect.arrayContaining([
                    expect.objectContaining({
                        name: '🤖 Why this track',
                        value: 'fresh artist rotation',
                    }),
                ]),
                footer: 'Autoplay • 7/50 songs',
            }),
        )
        expect(channel.send).toHaveBeenCalled()
    })

    it('updates existing now playing message in the same channel', async () => {
        const { queue, channel } = createQueue('guild-2')
        const track = {
            title: 'Song B',
            author: 'Artist B',
            url: 'https://example.com/b',
            duration: '2:40',
            thumbnail: null,
            requestedBy: { username: 'user-a' },
            metadata: {},
        }

        await sendNowPlayingEmbed(queue as any, track as any, false)
        await sendNowPlayingEmbed(queue as any, track as any, false)

        expect(channel.send).toHaveBeenCalledTimes(1)
        expect(channel.messages.fetch).toHaveBeenCalledWith('message-1')
    })
})
