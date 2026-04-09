import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    sendNowPlayingEmbed,
    updateLastFmNowPlaying,
    scrobbleCurrentTrackIfLastFm,
} from './trackNowPlaying'

const debugLogMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)
const getAutoplayCountMock = jest.fn()
const isLastFmConfiguredMock = jest.fn()
const getSessionKeyForUserMock = jest.fn()
const updateNowPlayingMock = jest.fn()
const scrobbleMock = jest.fn()
const createMusicControlButtonsMock = jest.fn(() => ({
    toJSON: () => ({ type: 1, components: [] }),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: jest.fn(),
}))

jest.mock('../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    EMBED_COLORS: { MUSIC: '#123456' },
}))

jest.mock('../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: (...args: unknown[]) =>
        createMusicControlButtonsMock(...args),
}))

jest.mock('../../utils/music/autoplayManager', () => ({
    getAutoplayCount: (...args: unknown[]) => getAutoplayCountMock(...args),
}))

jest.mock('@lucky/shared/config', () => ({
    constants: { MAX_AUTOPLAY_TRACKS: 50 },
}))

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: (...args: unknown[]) => isLastFmConfiguredMock(...args),
    getSessionKeyForUser: (...args: unknown[]) =>
        getSessionKeyForUserMock(...args),
    updateNowPlaying: (...args: unknown[]) => updateNowPlayingMock(...args),
    scrobble: (...args: unknown[]) => scrobbleMock(...args),
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
            metadata: { channel, requestedBy: undefined },
            currentTrack: null,
            tracks: {
                at: jest.fn(() => null),
                size: 0,
            },
            node: {
                isPaused: jest.fn(() => false),
            },
            history: {
                tracks: {
                    data: [],
                },
            },
        },
        channel,
    }
}

describe('trackNowPlaying', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getAutoplayCountMock.mockResolvedValue(7)
        isLastFmConfiguredMock.mockReturnValue(false)
        getSessionKeyForUserMock.mockResolvedValue(null)
        createMusicControlButtonsMock.mockReturnValue({ type: 1, components: [] })
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
        const buttons = { type: 1, components: [] }
        createMusicControlButtonsMock.mockReturnValue(buttons)

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
        expect(createMusicControlButtonsMock).toHaveBeenCalledWith(queue)
        expect(channel.send).toHaveBeenCalledWith(
            expect.objectContaining({ components: [buttons] }),
        )
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
        const buttons = { type: 1, components: [] }
        createMusicControlButtonsMock.mockReturnValue(buttons)

        await sendNowPlayingEmbed(queue as any, track as any, false)
        await sendNowPlayingEmbed(queue as any, track as any, false)

        expect(channel.send).toHaveBeenCalledTimes(1)
        expect(channel.messages.fetch).toHaveBeenCalledWith('message-1')
        expect(createMusicControlButtonsMock).toHaveBeenCalled()
        const message = await channel.messages.fetch('message-1')
        expect(message.edit).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.any(Array),
                components: [buttons],
            }),
        )
    })

    it.each([
        {
            name: 'track requester id over metadata and queue fallback',
            queueRequestedBy: 'queue-user',
            track: {
                title: 'Song C2',
                author: 'Artist C2',
                duration: '4:10',
                requestedBy: { id: 'track-user' },
                metadata: { requestedById: 'meta-user' },
            },
            expectedRequesterId: 'track-user',
            expectedSessionKey: 'session-track',
        },
        {
            name: 'track metadata requester id fallback',
            queueRequestedBy: undefined,
            track: {
                title: 'Song C',
                author: 'Artist C',
                duration: '4:12',
                metadata: { requestedById: 'meta-user' },
            },
            expectedRequesterId: 'meta-user',
            expectedSessionKey: 'session-meta',
        },
        {
            name: 'queue requester id fallback for scrobble',
            queueRequestedBy: 'queue-user',
            track: {
                title: 'Song D',
                author: 'Artist D',
                duration: '3:48',
                metadata: {},
            },
            expectedRequesterId: 'queue-user',
            expectedSessionKey: 'session-queue',
        },
    ])('resolves requester from $name', async (scenario) => {
        isLastFmConfiguredMock.mockReturnValue(true)
        getSessionKeyForUserMock.mockResolvedValue(scenario.expectedSessionKey)

        const { queue } = createQueue('guild-3')
        queue.metadata.requestedBy = scenario.queueRequestedBy
            ? { id: scenario.queueRequestedBy }
            : undefined

        await updateLastFmNowPlaying(queue as any, scenario.track as any)
        await scrobbleCurrentTrackIfLastFm(queue as any, scenario.track as any)

        expect(getSessionKeyForUserMock).toHaveBeenNthCalledWith(
            1,
            scenario.expectedRequesterId,
        )
        expect(getSessionKeyForUserMock).toHaveBeenNthCalledWith(
            2,
            scenario.expectedRequesterId,
        )
        expect(updateNowPlayingMock).toHaveBeenCalledWith(
            scenario.track.author,
            scenario.track.title,
            undefined,
            scenario.expectedSessionKey,
        )
        expect(scrobbleMock).toHaveBeenCalledWith(
            scenario.track.author,
            scenario.track.title,
            expect.any(Number),
            undefined,
            scenario.expectedSessionKey,
        )
    })

    it('skips now-playing and scrobble updates when requester cannot be resolved', async () => {
        isLastFmConfiguredMock.mockReturnValue(true)
        getSessionKeyForUserMock.mockResolvedValue(null)

        const { queue } = createQueue('guild-9')
        const track = {
            title: 'Song E',
            author: 'Artist E',
            duration: '4:00',
            metadata: {},
        }

        await updateLastFmNowPlaying(queue as any, track as any)
        await scrobbleCurrentTrackIfLastFm(queue as any, track as any)

        expect(getSessionKeyForUserMock).toHaveBeenNthCalledWith(1, undefined)
        expect(getSessionKeyForUserMock).toHaveBeenNthCalledWith(2, undefined)
        expect(updateNowPlayingMock).not.toHaveBeenCalled()
        expect(scrobbleMock).not.toHaveBeenCalled()
    })
})
