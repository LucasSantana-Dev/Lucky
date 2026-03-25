import { memo, useState, useCallback, useRef } from 'react'
import {
    ListMusic,
    Trash2,
    GripVertical,
    Music2,
    ChevronDown,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { toast } from 'sonner'
import type { TrackInfo } from '@/types'

interface QueueListProps {
    tracks: TrackInfo[]
    isLoading?: boolean
    onRemove: (index: number) => void
    onMove: (from: number, to: number) => void
    onClear: () => void
}

const INITIAL_VISIBLE = 20

export default memo(function QueueList({
    tracks,
    isLoading,
    onRemove,
    onMove,
    onClear,
}: QueueListProps) {
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
    const visibleTracks = tracks.slice(0, visibleCount)
    const hasMore = tracks.length > visibleCount
    const dragIndexRef = useRef<number | null>(null)
    const [dropTarget, setDropTarget] = useState<number | null>(null)

    const showMore = useCallback(() => {
        setVisibleCount((c) => Math.min(c + 20, tracks.length))
    }, [tracks.length])

    const handleDragStart = useCallback((index: number) => {
        dragIndexRef.current = index
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault()
        setDropTarget(index)
    }, [])

    const handleDrop = useCallback(
        (index: number) => {
            const from = dragIndexRef.current
            if (from !== null && from !== index) {
                onMove(from, index)
                toast.success('Track moved')
            }
            dragIndexRef.current = null
            setDropTarget(null)
        },
        [onMove],
    )

    const handleDragEnd = useCallback(() => {
        dragIndexRef.current = null
        setDropTarget(null)
    }, [])

    if (isLoading) return <QueueSkeleton />

    return (
        <Card className='p-4 sm:p-6'>
            <div className='flex items-center justify-between mb-3 sm:mb-4'>
                <div className='flex items-center gap-2'>
                    <ListMusic
                        className='h-5 w-5 text-primary shrink-0'
                        aria-hidden='true'
                    />
                    <h3 className='type-title text-lucky-text-primary'>
                        Queue
                    </h3>
                    <span className='text-xs sm:text-sm text-lucky-text-secondary tabular-nums'>
                        ({tracks.length} track{tracks.length !== 1 ? 's' : ''})
                    </span>
                </div>
                {tracks.length > 0 && (
                    <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => {
                            onClear()
                            toast.success('Queue cleared')
                        }}
                        className='text-red-400 hover:text-red-300 hover:bg-red-500/10 h-9 px-3'
                        aria-label='Clear queue'
                    >
                        <Trash2 className='h-4 w-4 mr-1' aria-hidden='true' />
                        <span className='hidden sm:inline'>Clear</span>
                    </Button>
                )}
            </div>

            {tracks.length === 0 ? (
                <EmptyState
                    icon={<ListMusic className='h-10 w-10' aria-hidden='true' />}
                    title='Queue is empty'
                    description='Search for a song or import a playlist to get started'
                    className='min-h-[180px]'
                />
            ) : (
                <div role='list' aria-label='Music queue'>
                    <div
                        className='space-y-0.5 sm:space-y-1 max-h-[60vh] sm:max-h-96 overflow-y-auto overscroll-contain'
                        style={{ contain: 'layout style' }}
                    >
                        {visibleTracks.map((track, index) => (
                            <QueueItem
                                key={`${track.id}-${index}`}
                                track={track}
                                index={index}
                                isDropTarget={dropTarget === index}
                                onRemove={onRemove}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                            />
                        ))}
                    </div>
                    {hasMore && (
                        <button
                            onClick={showMore}
                            className='w-full mt-2 py-2.5 text-sm text-lucky-text-secondary hover:text-white flex items-center justify-center gap-1 rounded-lg hover:bg-lucky-bg-tertiary active:bg-lucky-bg-tertiary transition-colors'
                            aria-label={`Show more tracks (${tracks.length - visibleCount} remaining)`}
                        >
                            <ChevronDown
                                className='h-4 w-4'
                                aria-hidden='true'
                            />
                            Show {Math.min(20, tracks.length - visibleCount)}{' '}
                            more
                        </button>
                    )}
                </div>
            )}
        </Card>
    )
})

function QueueSkeleton() {
    return (
        <Card className='p-4 sm:p-6'>
            <div className='flex items-center gap-2 mb-4'>
                <Skeleton className='h-5 w-5 rounded' />
                <Skeleton className='h-5 w-20' />
            </div>
            <div className='space-y-2'>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className='flex items-center gap-3 p-2'>
                        <Skeleton className='h-4 w-6' />
                        <Skeleton className='h-10 w-10 rounded shrink-0' />
                        <div className='flex-1 space-y-1.5'>
                            <Skeleton className='h-4 w-3/4' />
                            <Skeleton className='h-3 w-1/2' />
                        </div>
                        <Skeleton className='h-3 w-10' />
                    </div>
                ))}
            </div>
        </Card>
    )
}


const QueueItem = memo(function QueueItem({
    track,
    index,
    isDropTarget,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: {
    track: TrackInfo
    index: number
    isDropTarget: boolean
    onRemove: (i: number) => void
    onDragStart: (index: number) => void
    onDragOver: (e: React.DragEvent, index: number) => void
    onDrop: (index: number) => void
    onDragEnd: () => void
}) {
    return (
        <div
            className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg hover:bg-lucky-bg-tertiary active:bg-lucky-bg-tertiary group transition-colors ${
                isDropTarget
                    ? 'ring-1 ring-lucky-red/50 bg-lucky-bg-tertiary'
                    : ''
            }`}
            role='listitem'
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={() => onDrop(index)}
            onDragEnd={onDragEnd}
        >
            <span
                className='text-xs text-lucky-text-secondary w-5 sm:w-6 text-right font-mono tabular-nums shrink-0'
                aria-hidden='true'
            >
                {index + 1}
            </span>

            <GripVertical
                className='h-4 w-4 text-lucky-text-secondary opacity-0 group-hover:opacity-100 cursor-grab shrink-0 hidden sm:block'
                aria-hidden='true'
            />

            <TrackThumbnail thumbnail={track.thumbnail} />

            <div className='flex-1 min-w-0'>
                <p className='text-sm text-white truncate'>{track.title}</p>
                <p className='text-xs text-lucky-text-secondary truncate'>
                    {track.author}
                </p>
            </div>

            <span className='text-xs text-lucky-text-secondary font-mono tabular-nums shrink-0 hidden sm:block'>
                {track.durationFormatted}
            </span>

            <button
                onClick={() => {
                    onRemove(index)
                    toast.success('Track removed')
                }}
                className='min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-red-500/10 active:bg-red-500/10 text-lucky-text-secondary hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0'
                aria-label={`Remove ${track.title} from queue`}
            >
                <Trash2 className='h-4 w-4' />
            </button>
        </div>
    )
})

function TrackThumbnail({ thumbnail }: { thumbnail?: string }) {
    if (thumbnail) {
        return (
            <img
                src={thumbnail}
                alt=''
                loading='lazy'
                decoding='async'
                className='w-9 h-9 sm:w-10 sm:h-10 rounded object-cover shrink-0'
            />
        )
    }
    return (
        <div className='w-9 h-9 sm:w-10 sm:h-10 rounded bg-lucky-bg-secondary flex items-center justify-center shrink-0'>
            <Music2
                className='h-4 w-4 text-lucky-text-secondary'
                aria-hidden='true'
            />
        </div>
    )
}
