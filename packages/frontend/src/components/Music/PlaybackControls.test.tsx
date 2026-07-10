import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { PlaybackControls, VolumeSlider } from './PlaybackControls'

describe('PlaybackControls', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders all control buttons', () => {
        const props = {
            isPlaying: false,
            isPaused: false,
            hasTrack: true,
            repeatMode: 'off' as const,
            onPlayPause: vi.fn(),
            onSkip: vi.fn(),
            onStop: vi.fn(),
            onShuffle: vi.fn(),
            onRepeatCycle: vi.fn(),
        }

        render(<PlaybackControls {...props} />)

        expect(screen.getByLabelText('Shuffle')).toBeInTheDocument()
        expect(screen.getByLabelText('Previous')).toBeInTheDocument()
        expect(screen.getByLabelText('Play')).toBeInTheDocument()
        expect(screen.getByLabelText('Skip')).toBeInTheDocument()
        expect(screen.getByLabelText('Stop')).toBeInTheDocument()
    })

    test('calls onPlayPause when play button is clicked', async () => {
        const onPlayPause = vi.fn()
        const props = {
            isPlaying: false,
            isPaused: false,
            hasTrack: true,
            repeatMode: 'off' as const,
            onPlayPause,
            onSkip: vi.fn(),
            onStop: vi.fn(),
            onShuffle: vi.fn(),
            onRepeatCycle: vi.fn(),
        }

        render(<PlaybackControls {...props} />)

        await userEvent.click(screen.getByLabelText('Play'))
        expect(onPlayPause).toHaveBeenCalledOnce()
    })

    test('shows pause button when playing', () => {
        const props = {
            isPlaying: true,
            isPaused: false,
            hasTrack: true,
            repeatMode: 'off' as const,
            onPlayPause: vi.fn(),
            onSkip: vi.fn(),
            onStop: vi.fn(),
            onShuffle: vi.fn(),
            onRepeatCycle: vi.fn(),
        }

        render(<PlaybackControls {...props} />)

        expect(screen.getByLabelText('Pause')).toBeInTheDocument()
    })

    test('disables playback buttons when no track and not paused', () => {
        const props = {
            isPlaying: false,
            isPaused: false,
            hasTrack: false,
            repeatMode: 'off' as const,
            onPlayPause: vi.fn(),
            onSkip: vi.fn(),
            onStop: vi.fn(),
            onShuffle: vi.fn(),
            onRepeatCycle: vi.fn(),
        }

        render(<PlaybackControls {...props} />)

        expect(screen.getByLabelText('Play')).toBeDisabled()
        expect(screen.getByLabelText('Skip')).toBeDisabled()
        expect(screen.getByLabelText('Stop')).toBeDisabled()
    })

    test('shows repeat status in button aria-label', () => {
        const props = {
            isPlaying: false,
            isPaused: false,
            hasTrack: true,
            repeatMode: 'track' as const,
            onPlayPause: vi.fn(),
            onSkip: vi.fn(),
            onStop: vi.fn(),
            onShuffle: vi.fn(),
            onRepeatCycle: vi.fn(),
        }

        render(<PlaybackControls {...props} />)

        expect(screen.getByLabelText('Repeat mode: track')).toBeInTheDocument()
    })
})

describe('VolumeSlider', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
    })

    test('renders volume slider with mute button', () => {
        const onChange = vi.fn()
        render(<VolumeSlider volume={50} onChange={onChange} />)

        expect(screen.getByRole('slider')).toBeInTheDocument()
        expect(screen.getByLabelText('Mute')).toBeInTheDocument()
    })

    test('mutes volume when mute button is clicked', () => {
        const onChange = vi.fn()
        render(<VolumeSlider volume={50} onChange={onChange} />)

        fireEvent.click(screen.getByLabelText('Mute'))
        expect(onChange).toHaveBeenCalledWith(0)
    })

    test('unmutes volume when mute button is clicked while muted', () => {
        const onChange = vi.fn()
        render(<VolumeSlider volume={0} onChange={onChange} />)

        fireEvent.click(screen.getByLabelText('Unmute'))
        expect(onChange).toHaveBeenCalledWith(50)
    })

    test('debounces onChange calls when slider is adjusted', () => {
        const onChange = vi.fn()
        render(<VolumeSlider volume={50} onChange={onChange} />)

        const slider = screen.getByRole('slider') as HTMLInputElement

        // Simulate rapid slider changes
        fireEvent.change(slider, { target: { value: '60' } })
        fireEvent.change(slider, { target: { value: '70' } })
        fireEvent.change(slider, { target: { value: '80' } })

        // onChange should not have been called yet (debounced)
        expect(onChange).not.toHaveBeenCalled()

        // Fast-forward past debounce delay
        vi.advanceTimersByTime(150)

        // Now onChange should be called with the final value
        expect(onChange).toHaveBeenCalledOnce()
        expect(onChange).toHaveBeenCalledWith(80)
    })

    test('displays local volume while dragging, then syncs with prop', () => {
        const onChange = vi.fn()
        const { rerender } = render(
            <VolumeSlider volume={50} onChange={onChange} />,
        )

        const slider = screen.getByRole('slider') as HTMLInputElement

        // Change slider to 75
        fireEvent.change(slider, { target: { value: '75' } })

        // Local value should update immediately
        expect(slider.value).toBe('75')

        // Wait for debounce and onChange callback
        vi.advanceTimersByTime(150)
        expect(onChange).toHaveBeenCalledWith(75)

        // Rerender with new volume prop from parent
        rerender(<VolumeSlider volume={75} onChange={onChange} />)

        // Slider should now show the synced value
        expect(slider.value).toBe('75')
    })

    test('cleans up timeout on unmount', () => {
        const onChange = vi.fn()
        const { unmount } = render(
            <VolumeSlider volume={50} onChange={onChange} />,
        )

        const slider = screen.getByRole('slider') as HTMLInputElement
        fireEvent.change(slider, { target: { value: '60' } })

        // Unmount before debounce completes
        unmount()

        // Fast-forward timers
        vi.advanceTimersByTime(150)

        // onChange should not be called since component was unmounted
        expect(onChange).not.toHaveBeenCalled()
    })

    test('handles multiple rapid debounced updates correctly', () => {
        const onChange = vi.fn()
        render(<VolumeSlider volume={50} onChange={onChange} />)

        const slider = screen.getByRole('slider') as HTMLInputElement

        // First batch of changes
        fireEvent.change(slider, { target: { value: '60' } })
        fireEvent.change(slider, { target: { value: '70' } })
        vi.advanceTimersByTime(150)
        expect(onChange).toHaveBeenCalledOnce()
        expect(onChange).toHaveBeenLastCalledWith(70)

        onChange.mockClear()

        // Second batch of changes
        fireEvent.change(slider, { target: { value: '40' } })
        fireEvent.change(slider, { target: { value: '30' } })
        vi.advanceTimersByTime(150)
        expect(onChange).toHaveBeenCalledOnce()
        expect(onChange).toHaveBeenLastCalledWith(30)
    })

    test('updates onChange ref when prop changes', () => {
        const onChange1 = vi.fn()
        const onChange2 = vi.fn()

        const { rerender } = render(
            <VolumeSlider volume={50} onChange={onChange1} />,
        )

        const slider = screen.getByRole('slider') as HTMLInputElement
        fireEvent.change(slider, { target: { value: '60' } })

        vi.advanceTimersByTime(150)
        expect(onChange1).toHaveBeenCalledWith(60)

        // Switch to a different onChange handler
        onChange1.mockClear()
        rerender(<VolumeSlider volume={50} onChange={onChange2} />)

        fireEvent.change(slider, { target: { value: '70' } })
        vi.advanceTimersByTime(150)

        expect(onChange1).not.toHaveBeenCalled()
        expect(onChange2).toHaveBeenCalledWith(70)
    })
})
