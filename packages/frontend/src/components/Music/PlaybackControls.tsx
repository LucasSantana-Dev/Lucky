import { useState, useCallback } from 'react'
import {
    Play,
    Pause,
    SkipForward,
    Square,
    Volume2,
    VolumeX,
    Shuffle,
    Repeat,
    Repeat1,
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'

interface PlaybackControlsProps {
    isPlaying: boolean
    isPaused: boolean
    hasTrack: boolean
    repeatMode: string
    onPlayPause: () => void
    onSkip: () => void
    onStop: () => void
    onShuffle: () => void
    onRepeatCycle: () => void
}

export function PlaybackControls({
    isPlaying,
    isPaused,
    hasTrack,
    repeatMode,
    onPlayPause,
    onSkip,
    onStop,
    onShuffle,
    onRepeatCycle,
}: PlaybackControlsProps) {
    const canPlay = hasTrack || isPaused
    return (
        <div
            className='flex items-center justify-between mt-3 sm:mt-4'
            role='toolbar'
            aria-label='Playback controls'
        >
            <button
                onClick={onShuffle}
                className='p-2.5 sm:p-2 rounded-lg hover:bg-nexus-bg-tertiary active:bg-nexus-bg-tertiary text-nexus-text-secondary hover:text-white transition-colors'
                aria-label='Shuffle'
            >
                <Shuffle className='h-5 w-5 sm:h-4 sm:w-4' />
            </button>
            <div className='flex items-center gap-2 sm:gap-3'>
                <button
                    onClick={onSkip}
                    className='p-2.5 sm:p-2 rounded-lg hover:bg-nexus-bg-tertiary active:bg-nexus-bg-tertiary text-nexus-text-secondary hover:text-white transition-colors rotate-180 disabled:opacity-40'
                    aria-label='Previous'
                    disabled={!hasTrack}
                >
                    <SkipForward className='h-5 w-5' />
                </button>
                <button
                    onClick={onPlayPause}
                    className='p-3.5 sm:p-3 rounded-full bg-primary hover:bg-primary/80 active:bg-primary/70 text-white transition-colors disabled:opacity-40'
                    disabled={!canPlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? (
                        <Pause className='h-6 w-6 sm:h-5 sm:w-5' />
                    ) : (
                        <Play className='h-6 w-6 sm:h-5 sm:w-5 ml-0.5' />
                    )}
                </button>
                <button
                    onClick={onSkip}
                    className='p-2.5 sm:p-2 rounded-lg hover:bg-nexus-bg-tertiary active:bg-nexus-bg-tertiary text-nexus-text-secondary hover:text-white transition-colors disabled:opacity-40'
                    aria-label='Skip'
                    disabled={!hasTrack}
                >
                    <SkipForward className='h-5 w-5' />
                </button>
                <button
                    onClick={onStop}
                    className='p-2.5 sm:p-2 rounded-lg hover:bg-nexus-bg-tertiary active:bg-nexus-bg-tertiary text-nexus-text-secondary hover:text-white transition-colors disabled:opacity-40'
                    aria-label='Stop'
                    disabled={!hasTrack}
                >
                    <Square className='h-5 w-5 sm:h-4 sm:w-4' />
                </button>
            </div>
            <button
                onClick={onRepeatCycle}
                className={`p-2.5 sm:p-2 rounded-lg hover:bg-nexus-bg-tertiary active:bg-nexus-bg-tertiary transition-colors ${repeatMode !== 'off' ? 'text-primary' : 'text-nexus-text-secondary hover:text-white'}`}
                aria-label={`Repeat mode: ${repeatMode}`}
            >
                {repeatMode === 'track' ? (
                    <Repeat1 className='h-5 w-5 sm:h-4 sm:w-4' />
                ) : (
                    <Repeat className='h-5 w-5 sm:h-4 sm:w-4' />
                )}
            </button>
        </div>
    )
}

interface VolumeSliderProps {
    volume: number
    onChange: (v: number) => void
}

export function VolumeSlider({ volume, onChange }: VolumeSliderProps) {
    const [localVol, setLocalVol] = useState(volume)
    const debouncedChange = useDebounce(onChange, 150)

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = parseInt(e.target.value)
            setLocalVol(v)
            debouncedChange(v)
        },
        [debouncedChange],
    )

    const displayVol =
        localVol !== volume && localVol !== undefined ? localVol : volume

    return (
        <div
            className='flex items-center gap-3 mt-2 sm:mt-3'
            role='group'
            aria-label='Volume control'
        >
            <button
                onClick={() => {
                    const v = volume === 0 ? 50 : 0
                    setLocalVol(v)
                    onChange(v)
                }}
                className='p-1.5 text-nexus-text-secondary hover:text-white active:text-white transition-colors'
                aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            >
                {volume === 0 ? (
                    <VolumeX className='h-5 w-5 sm:h-4 sm:w-4' />
                ) : (
                    <Volume2 className='h-5 w-5 sm:h-4 sm:w-4' />
                )}
            </button>
            <input
                type='range'
                min={0}
                max={100}
                value={displayVol}
                onChange={handleChange}
                className='flex-1 h-2 sm:h-1 accent-primary cursor-pointer touch-none'
                aria-label='Volume'
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={displayVol}
            />
            <span
                className='text-xs text-nexus-text-secondary w-8 text-right tabular-nums'
                aria-hidden='true'
            >
                {displayVol}%
            </span>
        </div>
    )
}
