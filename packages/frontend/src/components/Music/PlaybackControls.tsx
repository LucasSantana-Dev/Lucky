import { useState, useCallback, useRef, useEffect } from 'react'
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
    Loader2,
} from 'lucide-react'

function BusyIcon({
    busy,
    children,
    className,
}: {
    busy: boolean
    children: React.ReactNode
    className?: string
}) {
    if (busy) {
        return <Loader2 className={className ?? 'h-5 w-5 animate-spin'} />
    }
    return children
}

interface PlaybackControlsProps {
    isPlaying: boolean
    isPaused: boolean
    hasTrack: boolean
    repeatMode: string
    /** When false, all controls are disabled (e.g. SSE disconnected). */
    isConnected?: boolean
    /** Which action is in flight, if any (shows busy state on that control). */
    pendingAction?: string | null
    onPlayPause: () => void
    onPrevious: () => void
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
    isConnected = true,
    pendingAction = null,
    onPlayPause,
    onPrevious,
    onSkip,
    onStop,
    onShuffle,
    onRepeatCycle,
}: PlaybackControlsProps) {
    const canPlay = (hasTrack || isPaused) && isConnected && !pendingAction
    const canTrack = hasTrack && isConnected && !pendingAction
    const canAux = isConnected && !pendingAction
    return (
        <div
            className='flex items-center justify-between mt-3 sm:mt-4'
            role='toolbar'
            aria-label='Playback controls'
            aria-disabled={!isConnected}
        >
            <button
                onClick={onShuffle}
                disabled={!canAux}
                className='p-2.5 sm:p-2 rounded-lg hover:bg-lucky-bg-tertiary active:bg-lucky-bg-tertiary text-lucky-text-secondary hover:text-white transition-colors disabled:opacity-40'
                aria-label='Shuffle'
                aria-busy={pendingAction === 'shuffle'}
            >
                <BusyIcon
                    busy={pendingAction === 'shuffle'}
                    className='h-5 w-5 sm:h-4 sm:w-4 animate-spin'
                >
                    <Shuffle className='h-5 w-5 sm:h-4 sm:w-4' />
                </BusyIcon>
            </button>
            <div className='flex items-center gap-2 sm:gap-3'>
                <button
                    onClick={onPrevious}
                    className='p-2.5 sm:p-2 rounded-lg hover:bg-lucky-bg-tertiary active:bg-lucky-bg-tertiary text-lucky-text-secondary hover:text-white transition-colors rotate-180 disabled:opacity-40'
                    aria-label='Previous'
                    disabled={!canTrack}
                    aria-busy={pendingAction === 'previous'}
                >
                    <BusyIcon busy={pendingAction === 'previous'}>
                        <SkipForward className='h-5 w-5' />
                    </BusyIcon>
                </button>
                <button
                    onClick={onPlayPause}
                    className='p-3.5 sm:p-3 rounded-full bg-primary hover:bg-primary/80 active:bg-primary/70 text-white transition-colors disabled:opacity-40'
                    disabled={!canPlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    aria-busy={
                        pendingAction === 'pause' || pendingAction === 'resume'
                    }
                >
                    <BusyIcon
                        busy={
                            pendingAction === 'pause' ||
                            pendingAction === 'resume'
                        }
                        className='h-6 w-6 sm:h-5 sm:w-5 animate-spin'
                    >
                        {isPlaying ? (
                            <Pause className='h-6 w-6 sm:h-5 sm:w-5' />
                        ) : (
                            <Play className='h-6 w-6 sm:h-5 sm:w-5 ml-0.5' />
                        )}
                    </BusyIcon>
                </button>
                <button
                    onClick={onSkip}
                    className='p-2.5 sm:p-2 rounded-lg hover:bg-lucky-bg-tertiary active:bg-lucky-bg-tertiary text-lucky-text-secondary hover:text-white transition-colors disabled:opacity-40'
                    aria-label='Skip'
                    disabled={!canTrack}
                    aria-busy={pendingAction === 'skip'}
                >
                    <BusyIcon busy={pendingAction === 'skip'}>
                        <SkipForward className='h-5 w-5' />
                    </BusyIcon>
                </button>
                <button
                    onClick={onStop}
                    className='p-2.5 sm:p-2 rounded-lg hover:bg-lucky-bg-tertiary active:bg-lucky-bg-tertiary text-lucky-text-secondary hover:text-white transition-colors disabled:opacity-40'
                    aria-label='Stop'
                    disabled={!canTrack}
                    aria-busy={pendingAction === 'stop'}
                >
                    <BusyIcon
                        busy={pendingAction === 'stop'}
                        className='h-5 w-5 sm:h-4 sm:w-4 animate-spin'
                    >
                        <Square className='h-5 w-5 sm:h-4 sm:w-4' />
                    </BusyIcon>
                </button>
            </div>
            <button
                onClick={onRepeatCycle}
                disabled={!canAux}
                className={`p-2.5 sm:p-2 rounded-lg hover:bg-lucky-bg-tertiary active:bg-lucky-bg-tertiary transition-colors disabled:opacity-40 ${repeatMode !== 'off' ? 'text-primary' : 'text-lucky-text-secondary hover:text-white'}`}
                aria-label={`Repeat mode: ${repeatMode}`}
                aria-busy={pendingAction === 'repeat'}
            >
                <BusyIcon
                    busy={pendingAction === 'repeat'}
                    className='h-5 w-5 sm:h-4 sm:w-4 animate-spin'
                >
                    {repeatMode === 'track' ? (
                        <Repeat1 className='h-5 w-5 sm:h-4 sm:w-4' />
                    ) : (
                        <Repeat className='h-5 w-5 sm:h-4 sm:w-4' />
                    )}
                </BusyIcon>
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
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [])

    const cancelPendingChange = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = parseInt(e.target.value)
            setLocalVol(v)
            cancelPendingChange()
            timerRef.current = setTimeout(() => {
                timerRef.current = null
                onChangeRef.current(v)
            }, 150)
        },
        [cancelPendingChange],
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
                    cancelPendingChange()
                    setLocalVol(v)
                    onChange(v)
                }}
                className='p-1.5 text-lucky-text-secondary hover:text-white active:text-white transition-colors'
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
                className='type-meta text-lucky-text-secondary w-8 text-right tabular-nums'
                aria-hidden='true'
            >
                {displayVol}%
            </span>
        </div>
    )
}
