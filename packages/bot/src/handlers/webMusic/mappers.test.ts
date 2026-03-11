import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { QueueRepeatMode } from 'discord-player'
import {
    buildQueueState,
    repeatModeToEnum,
    repeatModeToString,
} from './mappers'

const resolveGuildQueueMock = jest.fn()
type QueueStateClient = Parameters<typeof buildQueueState>[0]

function createClient(): QueueStateClient {
    return {
        player: {},
    } as unknown as QueueStateClient
}

jest.mock('../../utils/music/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

describe('web music repeat mode mappers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('maps autoplay enum to string', () => {
        expect(repeatModeToString(QueueRepeatMode.AUTOPLAY)).toBe('autoplay')
    })

    it('maps autoplay string to enum', () => {
        expect(repeatModeToEnum('autoplay')).toBe(QueueRepeatMode.AUTOPLAY)
    })

    it('builds empty queue state when resolver misses', async () => {
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 0,
                cacheSampleKeys: [],
            },
        })

        const state = await buildQueueState(createClient(), 'guild-1')

        expect(state.guildId).toBe('guild-1')
        expect(state.currentTrack).toBeNull()
        expect(state.tracks).toEqual([])
        expect(state.repeatMode).toBe('off')
    })

    it('builds populated queue state from resolver queue', async () => {
        const queue = {
            currentTrack: {
                id: 't1',
                title: 'Song',
                author: 'Artist',
                url: 'https://example.com/song',
                thumbnail: 'thumb',
                duration: { toString: () => '03:00' },
                durationMS: 180000,
                requestedBy: { username: 'luk' },
                source: 'youtube',
            },
            tracks: {
                toArray: jest.fn(() => []),
            },
            node: {
                isPlaying: jest.fn(() => true),
                isPaused: jest.fn(() => false),
                volume: 90,
                streamTime: 1000,
            },
            repeatMode: QueueRepeatMode.TRACK,
            channel: {
                id: 'vc-1',
                name: 'Voice',
            },
        }
        resolveGuildQueueMock.mockReturnValue({
            queue,
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: ['guild-1'],
            },
        })

        const state = await buildQueueState(createClient(), 'guild-1')

        expect(state.currentTrack?.title).toBe('Song')
        expect(state.isPlaying).toBe(true)
        expect(state.repeatMode).toBe('track')
        expect(state.voiceChannelId).toBe('vc-1')
    })
})
