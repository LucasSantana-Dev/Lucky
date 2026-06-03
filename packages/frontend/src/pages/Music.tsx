import { useCallback, useEffect } from 'react'
import {
    Music2,
    Wifi,
    WifiOff,
    Play,
    Pause,
    SkipForward,
    Shuffle,
    Repeat,
    Repeat1,
    Volume2,
} from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { useMusicPlayer } from '@/hooks/useMusicPlayer'
import SearchBar from '@/components/Music/SearchBar'
import ImportPlaylist from '@/components/Music/ImportPlaylist'
import QueueList from '@/components/Music/QueueList'
import AutoplayGenres from '@/components/Music/AutoplayGenres'
import EmptyState from '@/components/ui/EmptyState'

export default function MusicPage() {
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id
    const player = useMusicPlayer(guildId)

    const handlePlayPause = useCallback(() => {
        if (player.state.isPlaying) player.pause()
        else player.resume()
    }, [player])

    const handleRepeatCycle = useCallback(() => {
        const modes: Array<'off' | 'track' | 'queue' | 'autoplay'> = [
            'off',
            'track',
            'queue',
            'autoplay',
        ]
        const idx = modes.indexOf(player.state.repeatMode)
        player.setRepeatMode(modes[(idx + 1) % modes.length])
    }, [player])

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                handlePlayPause()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [handlePlayPause])

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Music2 className='h-10 w-10' aria-hidden='true' />}
                title='No Server Selected'
                description='Select a server to control music playback'
            />
        )
    }

    return (
        <div className='space-y-8 px-1 sm:px-0 pb-8'>
            <header className='flex items-center justify-between gap-3'>
                <div className='flex items-center gap-3 min-w-0'>
                    <Music2
                        className='h-6 w-6 sm:h-7 sm:w-7 text-lucky-brand shrink-0'
                        aria-hidden='true'
                    />
                    <div className='min-w-0'>
                        <h1 className='type-h1 text-lucky-text-primary truncate'>
                            Music Player
                        </h1>
                        <p className='type-body-sm text-lucky-text-secondary truncate'>
                            {player.state.voiceChannelName
                                ? `Connected to ${player.state.voiceChannelName}`
                                : 'Not connected to a voice channel'}
                        </p>
                    </div>
                </div>
                <ConnectionBadge connected={player.isConnected} />
            </header>

            <NowPlayingHero
                state={player.state}
                onPlayPause={handlePlayPause}
                onSkip={() => player.skip()}
                onShuffle={() => player.shuffle()}
                onRepeatCycle={handleRepeatCycle}
                onVolumeChange={(v) => player.setVolume(v)}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6'>
                <SearchBar
                    onPlay={async (q) => {
                        await player.play(q)
                    }}
                />
                <ImportPlaylist
                    onImport={async (url) => {
                        await player.importPlaylist(url)
                    }}
                />
            </div>

            {guildId && <AutoplayGenres guildId={guildId} />}

            <div>
                <h2 className='type-title text-lucky-text-primary mb-3 px-1'>
                    Queue
                </h2>
                <QueueList
                    tracks={player.state.tracks}
                    onRemove={(i) => player.removeTrack(i)}
                    onMove={(from, to) => player.moveTrack(from, to)}
                    onClear={() => player.clearQueue()}
                />
            </div>

            {player.error && (
                <div
                    className='type-body-sm text-lucky-error bg-lucky-error/10 border border-lucky-error/20 rounded-lg p-3'
                    role='alert'
                >
                    {player.error}
                </div>
            )}
        </div>
    )
}

function NowPlayingHero({
    state,
    onPlayPause,
    onSkip,
    onShuffle,
    onRepeatCycle,
    onVolumeChange,
}: {
    state: any
    onPlayPause: () => void
    onSkip: () => void
    onShuffle: () => void
    onRepeatCycle: () => void
    onVolumeChange: (v: number) => void
}) {
    const currentTrack = state.tracks[0]

    if (!currentTrack) {
        return (
            <div className='surface-panel rounded-xl p-6 sm:p-8 border border-lucky-border flex items-center justify-center min-h-[280px] sm:min-h-[320px]'>
                <div className='text-center'>
                    <Music2
                        className='h-12 w-12 text-lucky-text-tertiary mx-auto mb-3'
                        aria-hidden='true'
                    />
                    <p className='type-body text-lucky-text-secondary'>
                        Nothing playing
                    </p>
                    <p className='type-body-sm text-lucky-text-tertiary mt-1'>
                        Search or import to get started
                    </p>
                </div>
            </div>
        )
    }

    const duration = currentTrack.duration || 0
    const position = state.position || 0
    const progress = duration > 0 ? (position / duration) * 100 : 0

    return (
        <div className='surface-panel rounded-xl overflow-hidden border border-lucky-border'>
            <div className='p-4 sm:p-6'>
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 items-start'>
                    <div className='sm:col-span-1'>
                        <div className='w-full aspect-square rounded-lg bg-lucky-bg-active border border-lucky-border overflow-hidden flex items-center justify-center'>
                            {currentTrack.thumbnail ? (
                                <img
                                    src={currentTrack.thumbnail}
                                    alt={currentTrack.title}
                                    className='w-full h-full object-cover'
                                />
                            ) : (
                                <Music2 className='h-12 w-12 text-lucky-text-tertiary' />
                            )}
                        </div>
                    </div>

                    <div className='sm:col-span-2 flex flex-col justify-between'>
                        <div>
                            <p className='type-meta text-lucky-text-tertiary uppercase tracking-wider mb-2'>
                                Now Playing
                            </p>
                            <h2 className='type-h2 text-lucky-text-primary mb-1 line-clamp-2'>
                                {currentTrack.title || 'Unknown'}
                            </h2>
                            <p className='type-body text-lucky-text-secondary mb-4'>
                                {currentTrack.author || 'Unknown'}
                            </p>
                        </div>

                        <div>
                            <div className='flex items-center gap-2 mb-3'>
                                <div className='flex-1 h-1 bg-lucky-bg-active rounded-full overflow-hidden'>
                                    <div
                                        className='h-full bg-lucky-brand rounded-full'
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                            <div className='flex justify-between type-body-sm text-lucky-text-tertiary'>
                                <span>{formatSeconds(position)}</span>
                                <span>{formatSeconds(duration)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className='mt-6 space-y-4'>
                    <div className='flex items-center gap-2'>
                        <Volume2
                            className='h-4 w-4 text-lucky-text-tertiary flex-shrink-0'
                            aria-hidden='true'
                        />
                        <input
                            type='range'
                            min='0'
                            max='100'
                            value={state.volume ?? 50}
                            onChange={(e) =>
                                onVolumeChange(parseInt(e.target.value, 10))
                            }
                            className='flex-1 h-1 bg-lucky-bg-active rounded-full appearance-none cursor-pointer'
                            aria-label='Volume'
                        />
                    </div>

                    <div className='flex justify-center gap-2'>
                        <ControlButton
                            icon={<Shuffle className='h-4 w-4' />}
                            onClick={onShuffle}
                            active={state.shuffled}
                            aria-label='Shuffle'
                        />
                        <button
                            onClick={onPlayPause}
                            className='h-12 w-12 rounded-full bg-lucky-brand text-lucky-bg-primary flex items-center justify-center hover:bg-lucky-brand-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-surface-panel'
                            aria-label={state.isPlaying ? 'Pause' : 'Play'}
                        >
                            {state.isPlaying ? (
                                <Pause className='h-5 w-5' />
                            ) : (
                                <Play className='h-5 w-5' />
                            )}
                        </button>
                        <ControlButton
                            icon={<SkipForward className='h-5 w-5' />}
                            onClick={onSkip}
                            aria-label='Next track'
                        />
                        <ControlButton
                            icon={getRepeatIcon(state.repeatMode)}
                            onClick={onRepeatCycle}
                            active={state.repeatMode !== 'off'}
                            aria-label={`Repeat: ${state.repeatMode}`}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

function ControlButton({
    icon,
    onClick,
    active = false,
    ...props
}: {
    icon: React.ReactNode
    onClick: () => void
    active?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            onClick={onClick}
            className={`h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                active
                    ? 'bg-lucky-brand text-lucky-bg-primary'
                    : 'bg-lucky-bg-active text-lucky-text-secondary hover:bg-lucky-bg-active hover:text-lucky-text-primary'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand`}
            {...props}
        >
            {icon}
        </button>
    )
}

function getRepeatIcon(mode: 'off' | 'track' | 'queue' | 'autoplay') {
    switch (mode) {
        case 'track':
            return <Repeat1 className='h-4 w-4' />
        case 'queue':
            return <Repeat className='h-4 w-4' />
        case 'autoplay':
            return <Music2 className='h-4 w-4' />
        default:
            return <Repeat className='h-4 w-4 opacity-50' />
    }
}

function formatSeconds(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

function ConnectionBadge({ connected }: { connected: boolean }) {
    return (
        <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full type-meta shrink-0 border transition-colors ${
                connected
                    ? 'bg-lucky-success/10 text-lucky-success border-lucky-success/20'
                    : 'bg-lucky-warning/10 text-lucky-warning border-lucky-warning/20'
            }`}
            role='status'
            aria-label={
                connected
                    ? 'Connected to live updates'
                    : 'Reconnecting to live updates'
            }
        >
            {connected ? (
                <Wifi className='h-3 w-3' aria-hidden='true' />
            ) : (
                <WifiOff className='h-3 w-3' aria-hidden='true' />
            )}
            <span className='hidden sm:inline'>
                {connected ? 'Live' : 'Reconnecting'}
            </span>
        </div>
    )
}
