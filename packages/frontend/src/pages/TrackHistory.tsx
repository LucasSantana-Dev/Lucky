import { useState, useEffect, useCallback } from 'react'
import { History, BarChart3, Music2, User, Trash2, Clock } from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'

interface TrackEntry {
    trackId: string
    title: string
    author: string
    duration: string
    url: string
    timestamp: number
    playedBy?: string
}

interface Stats {
    totalTracks: number
    totalPlayTime: number
    topArtists: Array<{ artist: string; plays: number }>
    topTracks: Array<{ trackId: string; title: string; plays: number }>
    lastUpdated: string
}

function formatPlayTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
}

function formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

export default function TrackHistoryPage() {
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id
    const [history, setHistory] = useState<TrackEntry[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        if (!guildId) return
        setIsLoading(true)
        setError(null)
        try {
            const [histRes, statsRes] = await Promise.all([
                api.trackHistory.getHistory(guildId, 50),
                api.trackHistory.getStats(guildId),
            ])
            setHistory(histRes.data.history)
            setStats(statsRes.data.stats)
        } catch {
            setError('Failed to load track history')
        } finally {
            setIsLoading(false)
        }
    }, [guildId])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleClear = async () => {
        if (!guildId) return
        try {
            await api.trackHistory.clearHistory(guildId)
            setHistory([])
            setStats(null)
        } catch {
            setError('Failed to clear history')
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-64 text-lucky-text-secondary'>
                <History className='h-12 w-12 mb-4 opacity-50' />
                <p className='text-lg'>Select a server to view track history</p>
            </div>
        )
    }

    return (
        <div className='space-y-6 px-1 sm:px-0'>
            <header className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                    <History className='h-6 w-6 text-lucky-red' />
                    <h1 className='text-xl font-bold text-white'>
                        Track History
                    </h1>
                </div>
                {history.length > 0 && (
                    <button
                        onClick={handleClear}
                        className='flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-lucky-error/10 text-lucky-error hover:bg-lucky-error/20 transition-colors'
                    >
                        <Trash2 className='w-4 h-4' />
                        Clear
                    </button>
                )}
            </header>

            {error && (
                <div className='p-3 rounded-lg bg-lucky-error/10 text-lucky-error text-sm'>
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className='space-y-3'>
                    {[...Array(3)].map((_, i) => (
                        <div
                            key={i}
                            className='h-16 rounded-lg bg-lucky-bg-tertiary animate-pulse'
                        />
                    ))}
                </div>
            ) : (
                <>
                    {stats && (
                        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                            <StatCard
                                icon={Music2}
                                label='Tracks Played'
                                value={stats.totalTracks.toString()}
                            />
                            <StatCard
                                icon={Clock}
                                label='Play Time'
                                value={formatPlayTime(stats.totalPlayTime)}
                            />
                            <StatCard
                                icon={User}
                                label='Top Artist'
                                value={stats.topArtists[0]?.artist ?? 'None'}
                            />
                            <StatCard
                                icon={BarChart3}
                                label='Most Played'
                                value={stats.topTracks[0]?.title ?? 'None'}
                            />
                        </div>
                    )}

                    {stats && stats.topTracks.length > 0 && (
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                            <RankingCard
                                title='Top Tracks'
                                items={stats.topTracks.map((t) => ({
                                    label: t.title,
                                    count: t.plays,
                                }))}
                            />
                            <RankingCard
                                title='Top Artists'
                                items={stats.topArtists.map((a) => ({
                                    label: a.artist,
                                    count: a.plays,
                                }))}
                            />
                        </div>
                    )}

                    <div className='space-y-1'>
                        <h2 className='text-sm font-semibold text-lucky-text-secondary uppercase tracking-wider px-1'>
                            Recent Tracks
                        </h2>
                        {history.length === 0 ? (
                            <div className='text-center py-12 text-lucky-text-tertiary'>
                                No tracks played yet
                            </div>
                        ) : (
                            <div className='space-y-1'>
                                {history.map((track, i) => (
                                    <div
                                        key={`${track.trackId}-${i}`}
                                        className='flex items-center gap-3 px-3 py-2.5 rounded-lg bg-lucky-bg-tertiary hover:bg-lucky-bg-active transition-colors'
                                    >
                                        <div className='w-8 h-8 rounded bg-lucky-bg-active flex items-center justify-center text-lucky-text-tertiary text-xs font-mono shrink-0'>
                                            {i + 1}
                                        </div>
                                        <div className='flex-1 min-w-0'>
                                            <a
                                                href={track.url}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-sm font-medium text-white truncate block hover:text-lucky-red transition-colors'
                                            >
                                                {track.title}
                                            </a>
                                            <p className='text-xs text-lucky-text-tertiary truncate'>
                                                {track.author} ·{' '}
                                                {track.duration}
                                                {track.playedBy ? ` · Played by ${track.playedBy}` : ''}
                                            </p>
                                        </div>
                                        <span className='text-xs text-lucky-text-tertiary shrink-0'>
                                            {formatTimeAgo(track.timestamp)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

function StatCard({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
}) {
    return (
        <div className='p-4 rounded-lg bg-lucky-bg-tertiary border border-lucky-border'>
            <div className='flex items-center gap-2 mb-1'>
                <Icon className='w-4 h-4 text-lucky-text-tertiary' />
                <span className='text-xs text-lucky-text-tertiary'>
                    {label}
                </span>
            </div>
            <p className='text-lg font-bold text-white truncate'>{value}</p>
        </div>
    )
}

function RankingCard({
    title,
    items,
}: {
    title: string
    items: Array<{ label: string; count: number }>
}) {
    const max = items[0]?.count ?? 1
    return (
        <div className='p-4 rounded-lg bg-lucky-bg-tertiary border border-lucky-border'>
            <h3 className='text-sm font-semibold text-white mb-3'>{title}</h3>
            <div className='space-y-2'>
                {items.slice(0, 5).map((item, i) => (
                    <div key={item.label} className='flex items-center gap-2'>
                        <span className='text-xs text-lucky-text-tertiary w-4'>
                            {i + 1}
                        </span>
                        <div className='flex-1 min-w-0'>
                            <div className='flex items-center justify-between mb-0.5'>
                                <span className='text-sm text-white truncate'>
                                    {item.label}
                                </span>
                                <span className='text-xs text-lucky-text-tertiary ml-2 shrink-0'>
                                    {item.count}
                                </span>
                            </div>
                            <div className='h-1 bg-lucky-bg-active rounded-full overflow-hidden'>
                                <div
                                    className='h-full bg-lucky-red rounded-full'
                                    style={{
                                        width: `${(item.count / max) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
