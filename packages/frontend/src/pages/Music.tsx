import { useCallback, useEffect } from 'react'
import { Music2, Wifi, WifiOff } from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { useMusicPlayer } from '@/hooks/useMusicPlayer'
import NowPlaying from '@/components/Music/NowPlaying'
import SearchBar from '@/components/Music/SearchBar'
import ImportPlaylist from '@/components/Music/ImportPlaylist'
import QueueList from '@/components/Music/QueueList'
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
        <div className='space-y-4 sm:space-y-6 px-1 sm:px-0'>
            <header className='flex items-center justify-between gap-3'>
                <div className='flex items-center gap-3 min-w-0'>
                    <Music2
                        className='h-6 w-6 sm:h-7 sm:w-7 text-lucky-red shrink-0'
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

            <NowPlaying
                state={player.state}
                onPlayPause={handlePlayPause}
                onSkip={() => player.skip()}
                onStop={() => player.stop()}
                onShuffle={() => player.shuffle()}
                onRepeatCycle={handleRepeatCycle}
                onSeek={(ms) => player.seek(ms)}
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

            <QueueList
                tracks={player.state.tracks}
                onRemove={(i) => player.removeTrack(i)}
                onMove={(from, to) => player.moveTrack(from, to)}
                onClear={() => player.clearQueue()}
            />

            {player.error && (
                <div
                    className='type-body-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center'
                    role='alert'
                >
                    {player.error}
                </div>
            )}
        </div>
    )
}

function ConnectionBadge({ connected }: { connected: boolean }) {
    return (
        <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full type-meta shrink-0 ${
                connected
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
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
