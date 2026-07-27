import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Music2,
    Wifi,
    WifiOff,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Shuffle,
    Repeat,
    Repeat1,
    Volume2,
    Loader2,
} from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { useMusicPlayer } from '@/hooks/useMusicPlayer'
import SearchBar from '@/components/Music/SearchBar'
import ImportPlaylist from '@/components/Music/ImportPlaylist'
import QueueList from '@/components/Music/QueueList'
import AutoplayGenres from '@/components/Music/AutoplayGenres'
import EmptyState from '@/components/ui/EmptyState'
import type { QueueState } from '@/types'

export default function MusicPage() {
    const { t } = useTranslation()
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id
    const player = useMusicPlayer(guildId)
    const controlsEnabled = player.isConnected && !player.isLoading

    const handlePlayPause = useCallback(() => {
        if (!player.isConnected || player.isLoading) return
        if (player.state.isPlaying) player.pause()
        else player.resume()
    }, [player])

    const handleRepeatCycle = useCallback(() => {
        if (!player.isConnected || player.isLoading) return
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
                title={t('music.noServerSelected')}
                description={t('music.selectServerToControlMusic')}
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
                            {t('music.musicPlayer')}
                        </h1>
                        <p className='type-body-sm text-lucky-text-secondary truncate'>
                            {player.state.voiceChannelName
                                ? t('music.connectedToVoiceChannel', {
                                      channel: player.state.voiceChannelName,
                                  })
                                : t('music.notConnectedToVoiceChannel')}
                        </p>
                    </div>
                </div>
                <ConnectionBadge connected={player.isConnected} />
            </header>

            <NowPlayingHero
                state={player.state}
                controlsEnabled={controlsEnabled}
                pendingAction={player.pendingAction}
                onPlayPause={handlePlayPause}
                onPrevious={() => {
                    if (controlsEnabled) player.previous()
                }}
                onSkip={() => {
                    if (controlsEnabled) player.skip()
                }}
                onShuffle={() => {
                    if (controlsEnabled) player.shuffle()
                }}
                onRepeatCycle={handleRepeatCycle}
                onVolumeChange={(v) => {
                    if (controlsEnabled) player.setVolume(v)
                }}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6'>
                <SearchBar
                    disabled={!controlsEnabled}
                    onPlay={async (q) => {
                        if (!controlsEnabled) {
                            throw new Error('Player is not connected')
                        }
                        await player.play(q)
                    }}
                />
                <ImportPlaylist
                    disabled={!controlsEnabled}
                    onImport={async (url) => {
                        if (!controlsEnabled) {
                            throw new Error('Player is not connected')
                        }
                        await player.importPlaylist(url)
                    }}
                />
            </div>

            {guildId && <AutoplayGenres guildId={guildId} />}

            <div>
                <h2 className='type-title text-lucky-text-primary mb-3 px-1'>
                    {t('music.queue')}
                </h2>
                <QueueList
                    tracks={player.state.tracks}
                    disabled={!controlsEnabled}
                    onRemove={(i) => {
                        if (!controlsEnabled) return
                        player.removeTrack(i)
                    }}
                    onMove={(from, to) => {
                        if (!controlsEnabled) return
                        player.moveTrack(from, to)
                    }}
                    onClear={() => {
                        if (!controlsEnabled) return
                        player.clearQueue()
                    }}
                />
            </div>

            {player.error && (
                <div
                    className='type-body-sm text-lucky-error bg-lucky-error/10 border border-lucky-error/20 rounded-lg p-3 flex items-start justify-between gap-3'
                    role='alert'
                >
                    <span>{player.error}</span>
                    <button
                        type='button'
                        onClick={() => player.clearError()}
                        className='shrink-0 type-meta text-lucky-error/80 hover:text-lucky-error underline'
                    >
                        dismiss
                    </button>
                </div>
            )}
        </div>
    )
}

function NowPlayingHero({
    state,
    controlsEnabled,
    pendingAction,
    onPlayPause,
    onPrevious,
    onSkip,
    onShuffle,
    onRepeatCycle,
    onVolumeChange,
}: {
    state: QueueState
    controlsEnabled: boolean
    pendingAction: string | null
    onPlayPause: () => void
    onPrevious: () => void
    onSkip: () => void
    onShuffle: () => void
    onRepeatCycle: () => void
    onVolumeChange: (v: number) => void
}) {
    const { t } = useTranslation()
    const currentTrack = state.tracks[0]
    const busy = Boolean(pendingAction)

    if (!currentTrack) {
        return (
            <div className='surface-panel rounded-xl p-6 sm:p-8 border border-lucky-border flex items-center justify-center min-h-[280px] sm:min-h-[320px]'>
                <div className='text-center'>
                    <Music2
                        className='h-12 w-12 text-lucky-text-tertiary mx-auto mb-3'
                        aria-hidden='true'
                    />
                    <p className='type-body text-lucky-text-secondary'>
                        {t('music.nothingPlaying')}
                    </p>
                    <p className='type-body-sm text-lucky-text-tertiary mt-1'>
                        {t('music.searchOrImportToGetStarted')}
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
                            <p className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold mb-2'>
                                {t('music.nowPlaying')}
                            </p>
                            <h2 className='type-h2 text-lucky-text-primary mb-1 line-clamp-2'>
                                {currentTrack.title || t('music.unknown')}
                            </h2>
                            <p className='type-body text-lucky-text-secondary mb-4'>
                                {currentTrack.author || t('music.unknown')}
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
                            disabled={!controlsEnabled}
                            className='flex-1 h-1 bg-lucky-bg-active rounded-full appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                            aria-label={t('music.volume')}
                        />
                    </div>

                    <div
                        className='flex justify-center gap-2'
                        role='toolbar'
                        aria-label={t('music.musicPlayer')}
                        aria-disabled={!controlsEnabled}
                    >
                        <ControlButton
                            icon={
                                busy && pendingAction === 'shuffle' ? (
                                    <Loader2 className='h-4 w-4 animate-spin' />
                                ) : (
                                    <Shuffle className='h-4 w-4' />
                                )
                            }
                            onClick={onShuffle}
                            active={state.shuffled}
                            disabled={!controlsEnabled}
                            aria-label={t('music.shuffle')}
                        />
                        <ControlButton
                            icon={
                                busy && pendingAction === 'previous' ? (
                                    <Loader2 className='h-5 w-5 animate-spin' />
                                ) : (
                                    <SkipBack className='h-5 w-5' />
                                )
                            }
                            onClick={onPrevious}
                            disabled={!controlsEnabled}
                            aria-label={t('music.previousTrack')}
                        />
                        <button
                            onClick={onPlayPause}
                            disabled={!controlsEnabled}
                            className='h-12 w-12 rounded-full bg-lucky-brand text-lucky-bg-primary flex items-center justify-center hover:bg-lucky-brand-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-surface-panel disabled:opacity-40 disabled:cursor-not-allowed'
                            aria-label={
                                state.isPlaying
                                    ? t('music.pause')
                                    : t('music.play')
                            }
                            aria-busy={
                                pendingAction === 'pause' ||
                                pendingAction === 'resume'
                            }
                        >
                            {pendingAction === 'pause' ||
                            pendingAction === 'resume' ? (
                                <Loader2 className='h-5 w-5 animate-spin' />
                            ) : state.isPlaying ? (
                                <Pause className='h-5 w-5' />
                            ) : (
                                <Play className='h-5 w-5' />
                            )}
                        </button>
                        <ControlButton
                            icon={
                                busy && pendingAction === 'skip' ? (
                                    <Loader2 className='h-5 w-5 animate-spin' />
                                ) : (
                                    <SkipForward className='h-5 w-5' />
                                )
                            }
                            onClick={onSkip}
                            disabled={!controlsEnabled}
                            aria-label={t('music.nextTrack')}
                        />
                        <ControlButton
                            icon={
                                busy && pendingAction === 'repeat' ? (
                                    <Loader2 className='h-4 w-4 animate-spin' />
                                ) : (
                                    getRepeatIcon(state.repeatMode)
                                )
                            }
                            onClick={onRepeatCycle}
                            active={state.repeatMode !== 'off'}
                            disabled={!controlsEnabled}
                            aria-label={t('music.repeatMode', {
                                mode: state.repeatMode,
                            })}
                        />
                    </div>
                    {!controlsEnabled && (
                        <p className='type-meta text-center text-lucky-text-tertiary'>
                            {busy
                                ? t('music.commandInProgress')
                                : t('music.notConnectedToVoiceChannel')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

function ControlButton({
    icon,
    onClick,
    active = false,
    disabled = false,
    ...props
}: {
    icon: React.ReactNode
    onClick: () => void
    active?: boolean
    disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`h-10 w-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
    const { t } = useTranslation()
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
                    ? t('music.connectedToLiveUpdates')
                    : t('music.reconnectingToLiveUpdates')
            }
        >
            {connected ? (
                <Wifi className='h-3 w-3' aria-hidden='true' />
            ) : (
                <WifiOff className='h-3 w-3' aria-hidden='true' />
            )}
            <span className='hidden sm:inline'>
                {connected ? t('music.connected') : t('music.reconnecting')}
            </span>
        </div>
    )
}
