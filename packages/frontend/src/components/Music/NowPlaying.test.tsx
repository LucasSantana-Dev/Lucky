import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NowPlaying from './NowPlaying'
import type { QueueState } from '@/types'

const baseState: QueueState = {
    guildId: 'guild-1',
    currentTrack: {
        id: 'track-1',
        title: 'Track One',
        author: 'Artist One',
        url: 'https://example.com/track',
        duration: 180000,
        durationFormatted: '3:00',
        source: 'youtube',
    },
    tracks: [],
    isPlaying: true,
    isPaused: false,
    volume: 50,
    repeatMode: 'off',
    shuffled: false,
    position: 60000,
    voiceChannelId: 'voice-1',
    voiceChannelName: 'Music',
    timestamp: Date.now(),
}

function renderNowPlaying(
    state: QueueState,
    onSeek: (ms: number) => void = vi.fn(),
) {
    return {
        onSeek,
        ...render(
            <NowPlaying
                state={state}
                onPlayPause={vi.fn()}
                onSkip={vi.fn()}
                onStop={vi.fn()}
                onShuffle={vi.fn()}
                onRepeatCycle={vi.fn()}
                onSeek={onSeek}
                onVolumeChange={vi.fn()}
            />,
        ),
    }
}

describe('NowPlaying', () => {
    test('supports keyboard seek controls on slider', () => {
        const onSeek = vi.fn()
        renderNowPlaying(baseState, onSeek)
        const slider = screen.getByRole('slider', { name: 'Seek position' })

        fireEvent.keyDown(slider, { key: 'ArrowLeft' })
        fireEvent.keyDown(slider, { key: 'ArrowRight' })
        fireEvent.keyDown(slider, { key: 'Home' })
        fireEvent.keyDown(slider, { key: 'End' })

        expect(onSeek).toHaveBeenNthCalledWith(1, 51000)
        expect(onSeek).toHaveBeenNthCalledWith(2, 69000)
        expect(onSeek).toHaveBeenNthCalledWith(3, 0)
        expect(onSeek).toHaveBeenNthCalledWith(4, 180000)
    })

    test('ignores keyboard seek when track duration is zero', () => {
        const onSeek = vi.fn()
        renderNowPlaying(
            {
                ...baseState,
                currentTrack: {
                    ...baseState.currentTrack!,
                    duration: 0,
                },
            },
            onSeek,
        )

        const slider = screen.getByRole('slider', { name: 'Seek position' })
        fireEvent.keyDown(slider, { key: 'ArrowRight' })

        expect(onSeek).not.toHaveBeenCalled()
    })
})
