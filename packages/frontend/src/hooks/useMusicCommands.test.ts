import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMusicCommands } from './useMusicCommands'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({
    api: {
        music: {
            play: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            skip: vi.fn(),
            stop: vi.fn(),
            volume: vi.fn(),
            shuffle: vi.fn(),
            repeat: vi.fn(),
            seek: vi.fn(),
            removeTrack: vi.fn(),
            moveTrack: vi.fn(),
            clearQueue: vi.fn(),
            importPlaylist: vi.fn(),
        },
    },
}))

describe('useMusicCommands', () => {
    const sendCommand = vi.fn(
        async (action: () => Promise<unknown>) => {
            await action()
        },
    )
    const tracks = [
        { id: '1', title: 'A' },
        { id: '2', title: 'B' },
        { id: '3', title: 'C' },
    ] as any

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('does nothing when guildId is undefined', () => {
        const { result } = renderHook(() =>
            useMusicCommands(undefined, sendCommand, tracks),
        )

        act(() => {
            result.current.play('song')
            result.current.pause()
            result.current.resume()
            result.current.skip()
            result.current.stop()
            result.current.setVolume(50)
            result.current.shuffle()
            result.current.setRepeatMode('autoplay')
            result.current.seek(1000)
            result.current.removeTrack(1)
            result.current.moveTrack(0, 1)
            result.current.clearQueue()
            result.current.importPlaylist('https://playlist')
        })

        expect(sendCommand).not.toHaveBeenCalled()
    })

    test('sends all commands and optimistic patches', async () => {
        const { result } = renderHook(() =>
            useMusicCommands('guild-1', sendCommand, tracks),
        )

        await act(async () => {
            await result.current.play('hello', 'vc-1')
            await result.current.pause()
            await result.current.resume()
            await result.current.skip()
            await result.current.stop()
            await result.current.setVolume(30)
            await result.current.shuffle()
            await result.current.setRepeatMode('queue')
            await result.current.seek(9000)
            await result.current.removeTrack(1)
            await result.current.moveTrack(0, 2)
            await result.current.clearQueue()
            await result.current.importPlaylist('https://playlist', 'vc-1')
        })

        expect(api.music.play).toHaveBeenCalledWith('guild-1', 'hello', 'vc-1')
        expect(api.music.pause).toHaveBeenCalledWith('guild-1')
        expect(api.music.resume).toHaveBeenCalledWith('guild-1')
        expect(api.music.skip).toHaveBeenCalledWith('guild-1')
        expect(api.music.stop).toHaveBeenCalledWith('guild-1')
        expect(api.music.volume).toHaveBeenCalledWith('guild-1', 30)
        expect(api.music.shuffle).toHaveBeenCalledWith('guild-1')
        expect(api.music.repeat).toHaveBeenCalledWith('guild-1', 'queue')
        expect(api.music.seek).toHaveBeenCalledWith('guild-1', 9000)
        expect(api.music.removeTrack).toHaveBeenCalledWith('guild-1', 1)
        expect(api.music.moveTrack).toHaveBeenCalledWith('guild-1', 0, 2)
        expect(api.music.clearQueue).toHaveBeenCalledWith('guild-1')
        expect(api.music.importPlaylist).toHaveBeenCalledWith(
            'guild-1',
            'https://playlist',
            'vc-1',
        )

        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            isPlaying: false,
            isPaused: true,
        })
        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            isPlaying: true,
            isPaused: false,
        })
        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            isPlaying: false,
            isPaused: false,
            currentTrack: null,
            tracks: [],
        })
        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            volume: 30,
        })
        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            repeatMode: 'queue',
        })
        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            position: 9000,
        })
        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            tracks: [tracks[0], tracks[2]],
        })
        expect(sendCommand).toHaveBeenCalledWith(expect.any(Function), {
            tracks: [],
        })
    })
})
