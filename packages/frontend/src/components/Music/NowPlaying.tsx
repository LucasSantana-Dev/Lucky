import { memo, useState, useCallback } from 'react'
import { Disc3, ExternalLink, Music2, Radio } from 'lucide-react'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { PlaybackControls, VolumeSlider } from './PlaybackControls'
import type { TrackInfo, QueueState } from '@/types'

interface NowPlayingProps {
    state: QueueState
    isLoading?: boolean
    onPlayPause: () => void
    onSkip: () => void
    onStop: () => void
    onShuffle: () => void
    onRepeatCycle: () => void
    onSeek: (ms: number) => void
    onVolumeChange: (vol: number) => void
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const SOURCE_META: Record<string, { icon: typeof Disc3; color: string }> = {
    spotify: { icon: Disc3, color: 'text-green-400' },
    youtube: { icon: ExternalLink, color: 'text-red-400' },
    soundcloud: { icon: Radio, color: 'text-orange-400' },
    unknown: { icon: Music2, color: 'text-lucky-text-secondary' },
}

function SourceBadge({ source }: { source: TrackInfo['source'] }) {
    const meta = SOURCE_META[source] ?? SOURCE_META.unknown
    const Icon = meta.icon
    return (
        <div className='flex items-center gap-1.5'>
            <Icon className={`h-3 w-3 ${meta.color}`} aria-hidden='true' />
            <span className={`text-xs uppercase font-medium ${meta.color}`}>
                {source}
            </span>
        </div>
    )
}

export default memo(function NowPlaying({
    state,
    isLoading,
    onPlayPause,
    onSkip,
    onStop,
    onShuffle,
    onRepeatCycle,
    onSeek,
    onVolumeChange,
}: NowPlayingProps) {
    const { currentTrack, isPlaying, isPaused, volume, repeatMode, position } =
        state

    if (isLoading) return <NowPlayingSkeleton />

    return (
        <Card className='p-0 overflow-hidden contain-layout'>
            <div className='flex flex-col sm:flex-row'>
                <AlbumArt track={currentTrack} isPlaying={isPlaying} />
                <div className='flex-1 p-4 sm:p-6 flex flex-col justify-between min-w-0'>
                    <TrackDetails track={currentTrack} />
                    {currentTrack && (
                        <ProgressBar
                            position={position}
                            duration={currentTrack.duration}
                            formatted={currentTrack.durationFormatted}
                            onSeek={onSeek}
                        />
                    )}
                    <PlaybackControls
                        isPlaying={isPlaying}
                        isPaused={isPaused}
                        hasTrack={!!currentTrack}
                        repeatMode={repeatMode}
                        onPlayPause={onPlayPause}
                        onSkip={onSkip}
                        onStop={onStop}
                        onShuffle={onShuffle}
                        onRepeatCycle={onRepeatCycle}
                    />
                    <VolumeSlider volume={volume} onChange={onVolumeChange} />
                </div>
            </div>
        </Card>
    )
})

function NowPlayingSkeleton() {
    return (
        <Card className='p-0 overflow-hidden'>
            <div className='flex flex-col sm:flex-row'>
                <Skeleton className='w-full sm:w-56 md:w-64 h-44 sm:h-56 md:h-64 shrink-0 rounded-none' />
                <div className='flex-1 p-4 sm:p-6 space-y-4'>
                    <div className='space-y-2'>
                        <Skeleton className='h-3 w-16' />
                        <Skeleton className='h-6 w-3/4' />
                        <Skeleton className='h-4 w-1/2' />
                    </div>
                    <Skeleton className='h-2 w-full rounded-full' />
                    <div className='flex justify-center gap-3'>
                        <Skeleton className='h-10 w-10 rounded-lg' />
                        <Skeleton className='h-12 w-12 rounded-full' />
                        <Skeleton className='h-10 w-10 rounded-lg' />
                    </div>
                    <Skeleton className='h-2 w-full rounded-full' />
                </div>
            </div>
        </Card>
    )
}

function AlbumArt({
    track,
    isPlaying,
}: {
    track: TrackInfo | null
    isPlaying: boolean
}) {
    const [imgLoaded, setImgLoaded] = useState(false)

    return (
        <div
            className='relative w-full sm:w-56 md:w-64 h-44 sm:h-56 md:h-64 bg-lucky-bg-tertiary shrink-0'
            aria-hidden='true'
        >
            {track?.thumbnail ? (
                <>
                    {!imgLoaded && (
                        <Skeleton className='absolute inset-0 rounded-none' />
                    )}
                    <img
                        src={track.thumbnail}
                        alt=''
                        loading='lazy'
                        decoding='async'
                        onLoad={() => setImgLoaded(true)}
                        className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                    />
                </>
            ) : (
                <div className='w-full h-full flex items-center justify-center'>
                    <Disc3
                        className={`h-16 w-16 sm:h-20 sm:w-20 text-lucky-text-secondary opacity-30 ${isPlaying ? 'animate-spin motion-reduce:animate-none' : ''}`}
                        style={{ animationDuration: '3s' }}
                    />
                </div>
            )}
            {isPlaying && (
                <div
                    className='absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1'
                    role='status'
                    aria-label='Now playing'
                >
                    <span
                        className='flex gap-0.5 motion-reduce:hidden'
                        aria-hidden='true'
                    >
                        {[1, 2, 3].map((i) => (
                            <span
                                key={i}
                                className='w-0.5 bg-primary rounded-full animate-pulse'
                                style={{
                                    height: `${8 + i * 3}px`,
                                    animationDelay: `${i * 0.15}s`,
                                }}
                            />
                        ))}
                    </span>
                    <span className='text-xs text-white ml-1'>Playing</span>
                </div>
            )}
        </div>
    )
}

function TrackDetails({ track }: { track: TrackInfo | null }) {
    if (!track) {
        return (
            <div role='status' aria-label='No track playing'>
                <h2 className='text-lg sm:text-xl font-bold text-lucky-text-secondary'>
                    Nothing playing
                </h2>
                <p className='text-sm text-lucky-text-secondary'>
                    Search for a song or import a playlist
                </p>
            </div>
        )
    }
    return (
        <div aria-label={`Now playing: ${track.title} by ${track.author}`}>
            <SourceBadge source={track.source} />
            <h2
                className='text-lg sm:text-xl font-bold text-white truncate mt-1'
                title={track.title}
            >
                {track.title}
            </h2>
            <p className='text-sm text-lucky-text-secondary truncate'>
                {track.author}
            </p>
            {track.requestedBy && (
                <p className='text-xs text-lucky-text-secondary mt-1'>
                    Requested by {track.requestedBy}
                </p>
            )}
        </div>
    )
}

function ProgressBar({
    position,
    duration,
    formatted,
    onSeek,
}: {
    position: number
    duration: number
    formatted: string
    onSeek: (ms: number) => void
}) {
    const pct = duration > 0 ? Math.min((position / duration) * 100, 100) : 0

    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect()
            onSeek(
                Math.floor(((e.clientX - rect.left) / rect.width) * duration),
            )
        },
        [duration, onSeek],
    )

    return (
        <div className='mt-3 sm:mt-4'>
            <div
                className='w-full bg-lucky-bg-tertiary rounded-full h-2 sm:h-1.5 cursor-pointer group touch-none'
                onClick={handleClick}
                role='slider'
                aria-label='Seek position'
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={position}
                aria-valuetext={formatDuration(position)}
                tabIndex={0}
            >
                <div
                    className='bg-primary h-full rounded-full transition-[width] duration-150 group-hover:h-2.5 sm:group-hover:h-2'
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className='flex justify-between text-xs text-lucky-text-secondary mt-1'>
                <span>{formatDuration(position)}</span>
                <span>{formatted}</span>
            </div>
        </div>
    )
}
