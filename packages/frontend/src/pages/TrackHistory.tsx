import { useState, useEffect, useCallback } from 'react'
import { History, BarChart3, Music2, User, Trash2, Clock } from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'

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

const PAGE_SIZE = 50

export default function TrackHistoryPage() {
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id
    const [history, setHistory] = useState<TrackEntry[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

    const loadData = useCallback(
        async (reset = true) => {
            if (!guildId) return
            if (reset) {
                setIsLoading(true)
                setHistory([])
                setPage(1)
            } else {
                setIsLoadingMore(true)
            }
            setError(null)
            try {
                const offset = reset ? 0 : (page - 1) * PAGE_SIZE
                const [histRes, statsRes] = await Promise.all([
                    api.trackHistory.getHistory(guildId, PAGE_SIZE, offset),
                    reset
                        ? api.trackHistory.getStats(guildId)
                        : Promise.resolve(null),
                ])
                if (reset) {
                    setHistory(histRes.data.history)
                    setStats(statsRes?.data.stats ?? null)
                } else {
                    setHistory((prev) => [...prev, ...histRes.data.history])
                }
                setTotal(histRes.data.total)
            } catch {
                setError('Failed to load track history')
            } finally {
                setIsLoading(false)
                setIsLoadingMore(false)
            }
        },
        [guildId, page],
    )

    useEffect(() => {
        loadData(true)
    }, [guildId])

    useEffect(() => {
        if (page > 1) {
            loadData(false)
        }
    }, [page])

    const handleClear = async () => {
        if (!guildId) return
        try {
            await api.trackHistory.clearHistory(guildId)
            setHistory([])
            setStats(null)
            setTotal(0)
            setPage(1)
        } catch {
            setError('Failed to clear history')
        }
    }

    const handleLoadMore = () => {
        setPage((prev) => prev + 1)
    }

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<History className='h-10 w-10' aria-hidden='true' />}
                title='No Server Selected'
                description='Select a server to view track history'
            />
        )
    }

    return (
        <div className='space-y-6 px-1 sm:px-0'>
            <header className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                    <History className='h-6 w-6 text-lucky-red' />
                    <h1 className='type-h2 text-lucky-text-primary'>
                        Track History
                    </h1>
                </div>
                {history.length > 0 && (
                    <button
                        onClick={handleClear}
                        className='flex items-center gap-2 px-3 min-h-[44px] type-body-sm rounded-lg bg-lucky-error/10 text-lucky-error hover:bg-lucky-error/20 transition-colors'
                    >
                        <Trash2 className='w-4 h-4' />
                        Clear
                    </button>
                )}
            </header>

            {error && (
                <div className='p-3 rounded-lg bg-lucky-error/10 text-lucky-error type-body-sm'>
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
                            <StatTile
                                icon={<Music2 className='w-4 h-4' />}
                                label='Tracks Played'
                                value={stats.totalTracks}
                                tone='brand'
                            />
                            <StatTile
                                icon={<Clock className='w-4 h-4' />}
                                label='Play Time'
                                value={formatPlayTime(stats.totalPlayTime)}
                                tone='neutral'
                            />
                            <StatTile
                                icon={<User className='w-4 h-4' />}
                                label='Top Artist'
                                value={stats.topArtists[0]?.artist ?? 'None'}
                                tone='accent'
                            />
                            <StatTile
                                icon={<BarChart3 className='w-4 h-4' />}
                                label='Most Played'
                                value={stats.topTracks[0]?.title ?? 'None'}
                                tone='warning'
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
                        <div className='flex items-center justify-between px-1 mb-3'>
                            <h2 className='type-meta text-lucky-text-tertiary uppercase tracking-wider'>
                                Recent Tracks
                            </h2>
                            {total > 0 && (
                                <span className='type-body-sm text-lucky-text-tertiary'>
                                    Showing {history.length} of {total}
                                </span>
                            )}
                        </div>
                        {history.length === 0 ? (
                            <EmptyState
                                icon={
                                    <History
                                        className='h-10 w-10'
                                        aria-hidden='true'
                                    />
                                }
                                title='No tracks played yet'
                                description='Play some music to see your history here'
                                className='min-h-[180px]'
                            />
                        ) : (
                            <div className='space-y-1'>
                                {history.map((track, i) => (
                                    <div
                                        key={`${track.trackId}-${i}`}
                                        className='flex items-center gap-3 px-3 py-2.5 rounded-lg bg-lucky-bg-tertiary hover:bg-lucky-bg-active transition-colors'
                                    >
                                        <div className='w-8 h-8 rounded bg-lucky-bg-active flex items-center justify-center text-lucky-text-tertiary type-meta shrink-0'>
                                            {i + 1}
                                        </div>
                                        <div className='flex-1 min-w-0'>
                                            <a
                                                href={track.url}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='type-body text-lucky-text-primary truncate block hover:text-lucky-brand transition-colors'
                                            >
                                                {track.title}
                                            </a>
                                            <p className='type-body-sm text-lucky-text-tertiary truncate'>
                                                {track.author} ·{' '}
                                                {track.duration}
                                                {track.playedBy
                                                    ? ` · Played by ${track.playedBy}`
                                                    : ''}
                                            </p>
                                        </div>
                                        <span className='type-body-sm text-lucky-text-tertiary shrink-0'>
                                            {formatTimeAgo(track.timestamp)}
                                        </span>
                                    </div>
                                ))}
                                {history.length < total && (
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={isLoadingMore}
                                        className='w-full mt-4 px-3 py-2 rounded-lg border border-lucky-border text-lucky-text-secondary hover:text-lucky-text-primary hover:bg-lucky-bg-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed type-body-sm font-medium'
                                    >
                                        {isLoadingMore
                                            ? 'Loading...'
                                            : 'Load More Tracks'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
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
            <h3 className='type-title text-lucky-text-primary mb-3'>{title}</h3>
            <div className='space-y-2'>
                {items.slice(0, 5).map((item, i) => (
                    <div key={item.label} className='flex items-center gap-2'>
                        <span className='type-meta text-lucky-text-tertiary w-4'>
                            {i + 1}
                        </span>
                        <div className='flex-1 min-w-0'>
                            <div className='flex items-center justify-between mb-0.5'>
                                <span className='type-body-sm text-lucky-text-primary truncate'>
                                    {item.label}
                                </span>
                                <span className='type-body-sm text-lucky-text-tertiary ml-2 shrink-0'>
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
