import { describe, it, expect, jest } from '@jest/globals'

jest.mock('discord-player', () => ({
    QueueRepeatMode: {
        OFF: 0,
        TRACK: 1,
        QUEUE: 2,
        AUTOPLAY: 3,
    },
}))

jest.mock('../../utils/music/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

import {
    mapTrack,
    repeatModeToString,
    repeatModeToEnum,
    buildQueueState,
} from './mappers'
import { QueueRepeatMode } from 'discord-player'
import { resolveGuildQueue } from '../../utils/music/queueResolver'

const resolveGuildQueueMock = resolveGuildQueue as jest.MockedFunction<
    typeof resolveGuildQueue
>

function makeRawTrack(overrides: Record<string, unknown> = {}) {
    return {
        id: 'track-1',
        title: 'Song',
        author: 'Artist',
        url: 'https://example.com/song',
        thumbnail: 'https://example.com/thumb.jpg',
        duration: { toString: () => '3:21' },
        durationMS: 201000,
        requestedBy: { username: 'user1' },
        source: 'youtube',
        ...overrides,
    }
}

describe('mapTrack', () => {
    it('maps all fields from a raw track', () => {
        const track = mapTrack(makeRawTrack())
        expect(track).toEqual({
            id: 'track-1',
            title: 'Song',
            author: 'Artist',
            url: 'https://example.com/song',
            thumbnail: 'https://example.com/thumb.jpg',
            duration: 201000,
            durationFormatted: '3:21',
            requestedBy: 'user1',
            source: 'youtube',
        })
    })

    it('maps spotify source correctly', () => {
        const track = mapTrack(makeRawTrack({ source: 'spotify' }))
        expect(track.source).toBe('spotify')
    })

    it('maps soundcloud source correctly', () => {
        const track = mapTrack(makeRawTrack({ source: 'soundcloud' }))
        expect(track.source).toBe('soundcloud')
    })

    it('maps unknown source to "unknown"', () => {
        const track = mapTrack(makeRawTrack({ source: 'bandcamp' }))
        expect(track.source).toBe('unknown')
    })

    it('maps undefined source to "unknown"', () => {
        const track = mapTrack(makeRawTrack({ source: undefined }))
        expect(track.source).toBe('unknown')
    })

    it('handles null requestedBy', () => {
        const track = mapTrack(makeRawTrack({ requestedBy: null }))
        expect(track.requestedBy).toBeUndefined()
    })
})

describe('repeatModeToString', () => {
    it('converts TRACK mode', () => {
        expect(repeatModeToString(QueueRepeatMode.TRACK)).toBe('track')
    })

    it('converts QUEUE mode', () => {
        expect(repeatModeToString(QueueRepeatMode.QUEUE)).toBe('queue')
    })

    it('converts AUTOPLAY mode', () => {
        expect(repeatModeToString(QueueRepeatMode.AUTOPLAY)).toBe('autoplay')
    })

    it('converts OFF mode to "off"', () => {
        expect(repeatModeToString(QueueRepeatMode.OFF)).toBe('off')
    })

    it('converts unknown mode to "off"', () => {
        expect(repeatModeToString(99 as QueueRepeatMode)).toBe('off')
    })
})

describe('repeatModeToEnum', () => {
    it('converts "track" to TRACK', () => {
        expect(repeatModeToEnum('track')).toBe(QueueRepeatMode.TRACK)
    })

    it('converts "queue" to QUEUE', () => {
        expect(repeatModeToEnum('queue')).toBe(QueueRepeatMode.QUEUE)
    })

    it('converts "autoplay" to AUTOPLAY', () => {
        expect(repeatModeToEnum('autoplay')).toBe(QueueRepeatMode.AUTOPLAY)
    })

    it('converts "off" to OFF', () => {
        expect(repeatModeToEnum('off')).toBe(QueueRepeatMode.OFF)
    })

    it('converts unknown string to OFF', () => {
        expect(repeatModeToEnum('unknown')).toBe(QueueRepeatMode.OFF)
    })
})

describe('buildQueueState', () => {
    it('returns empty queue state when queue is null', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null } as never)
        const state = await buildQueueState({} as never, 'guild-1')
        expect(state).toEqual({
            guildId: 'guild-1',
            currentTrack: null,
            tracks: [],
            isPlaying: false,
            isPaused: false,
            volume: 50,
            repeatMode: 'off',
            shuffled: false,
            position: 0,
            voiceChannelId: null,
            voiceChannelName: null,
            timestamp: expect.any(Number),
        })
    })

    it('returns populated queue state when queue exists', async () => {
        const mockQueue = {
            currentTrack: makeRawTrack(),
            tracks: {
                toArray: () => [
                    makeRawTrack({ id: 'track-2', title: 'Next Song' }),
                ],
            },
            node: {
                isPlaying: () => true,
                isPaused: () => false,
                volume: 80,
                streamTime: 12000,
            },
            repeatMode: QueueRepeatMode.QUEUE,
            channel: { id: 'vc-1', name: 'Music' },
        }
        resolveGuildQueueMock.mockReturnValue({ queue: mockQueue } as never)
        const state = await buildQueueState({} as never, 'guild-1')
        expect(state.guildId).toBe('guild-1')
        expect(state.currentTrack?.title).toBe('Song')
        expect(state.tracks).toHaveLength(1)
        expect(state.isPlaying).toBe(true)
        expect(state.volume).toBe(80)
        expect(state.repeatMode).toBe('queue')
        expect(state.position).toBe(12000)
        expect(state.voiceChannelId).toBe('vc-1')
    })

    it('handles queue with null currentTrack', async () => {
        const mockQueue = {
            currentTrack: null,
            tracks: { toArray: () => [] },
            node: {
                isPlaying: () => false,
                isPaused: () => false,
                volume: 50,
                streamTime: 0,
            },
            repeatMode: QueueRepeatMode.OFF,
            channel: null,
        }
        resolveGuildQueueMock.mockReturnValue({ queue: mockQueue } as never)
        const state = await buildQueueState({} as never, 'guild-1')
        expect(state.currentTrack).toBeNull()
        expect(state.voiceChannelId).toBeNull()
    })
})
