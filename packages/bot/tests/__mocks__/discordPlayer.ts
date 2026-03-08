import type { Track } from 'discord-player'

export function createMockTrack(overrides: Partial<Track> = {}): Track {
    return {
        id: 'track-1',
        title: 'Test Song',
        author: 'Test Artist',
        url: 'https://youtube.com/watch?v=abc123',
        duration: '3:30',
        durationMS: 210000,
        thumbnail: 'https://img.youtube.com/vi/abc123/0.jpg',
        views: 1000000,
        requestedBy: null,
        source: 'youtube',
        raw: {},
        toJSON: jest.fn(),
        toString: () => 'Test Song by Test Artist',
        ...overrides,
    } as unknown as Track
}

export function createMockQueue() {
    const tracks: Track[] = []

    return {
        guild: { id: '987654321' },
        channel: { id: '444555666' },
        node: {
            play: jest.fn().mockResolvedValue(undefined),
            pause: jest.fn(),
            resume: jest.fn(),
            skip: jest.fn(),
            stop: jest.fn(),
            setVolume: jest.fn(),
            seek: jest.fn(),
            isPaused: jest.fn().mockReturnValue(false),
            isPlaying: jest.fn().mockReturnValue(true),
        },
        currentTrack: null as Track | null,
        tracks: {
            data: tracks,
            size: tracks.length,
            toArray: () => [...tracks],
            at: (i: number) => tracks[i],
        },
        isPlaying: jest.fn().mockReturnValue(false),
        addTrack: jest.fn((track: Track) => tracks.push(track)),
        metadata: {
            channel: { id: '444555666' },
            requestedBy: { id: '123456789' },
        },
        setMetadata: jest.fn(),
        delete: jest.fn(),
        setRepeatMode: jest.fn(),
    }
}
