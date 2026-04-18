import { useRef, useCallback, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import type { SpotifyArtist, ArtistPreference } from '@/services/artistsApi'
import { cn } from '@/lib/utils'

interface RelatedArtistsCarouselProps {
    title: string
    artists: SpotifyArtist[]
    loading: boolean
    savedPreferences: Map<string, ArtistPreference>
    onSelectArtist: (artist: SpotifyArtist) => void
    normalizeArtistKey: (name: string) => string
}

function normalizeArtistKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function RelatedArtistsCarousel({
    title,
    artists,
    loading,
    savedPreferences,
    onSelectArtist,
}: RelatedArtistsCarouselProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(true)
    const prefersReducedMotion = useReducedMotion()

    const checkScroll = useCallback(() => {
        if (!scrollRef.current) return
        setCanScrollLeft(scrollRef.current.scrollLeft > 0)
        setCanScrollRight(
            scrollRef.current.scrollLeft <
                scrollRef.current.scrollWidth - scrollRef.current.clientWidth - 10,
        )
    }, [])

    useEffect(() => {
        checkScroll()
        const element = scrollRef.current
        if (!element) return
        element.addEventListener('scroll', checkScroll)
        window.addEventListener('resize', checkScroll)
        return () => {
            element.removeEventListener('scroll', checkScroll)
            window.removeEventListener('resize', checkScroll)
        }
    }, [checkScroll])

    const scroll = (direction: 'left' | 'right') => {
        if (!scrollRef.current) return
        const distance = 300
        const targetScroll =
            scrollRef.current.scrollLeft +
            (direction === 'left' ? -distance : distance)

        if (prefersReducedMotion) {
            scrollRef.current.scrollLeft = targetScroll
        } else {
            scrollRef.current.scrollTo({
                left: targetScroll,
                behavior: 'smooth',
            })
        }
    }

    if (loading) {
        return (
            <div className='space-y-3'>
                <h3 className='text-sm font-semibold text-lucky-text-primary'>
                    {title}
                </h3>
                <div className='flex h-40 items-center justify-center rounded-lg bg-lucky-bg-tertiary'>
                    <Loader2 className='h-5 w-5 animate-spin text-lucky-text-tertiary' />
                </div>
            </div>
        )
    }

    if (artists.length === 0) {
        return (
            <div className='space-y-3'>
                <h3 className='text-sm font-semibold text-lucky-text-primary'>
                    {title}
                </h3>
                <p className='text-sm text-lucky-text-tertiary'>
                    No related artists found
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-3'>
            <h3 className='text-sm font-semibold text-lucky-text-primary'>
                {title}
            </h3>
            <div className='group relative'>
                <div
                    ref={scrollRef}
                    className='flex gap-4 overflow-x-auto scroll-smooth pb-2 scrollbar-hide'
                    role='region'
                    aria-label={title}
                >
                    {artists.map((artist) => {
                        const key = normalizeArtistKey(artist.name)
                        const pref = savedPreferences.get(key)
                        return (
                            <ArtistTile
                                key={artist.id}
                                artist={artist}
                                preference={
                                    pref
                                        ? pref.preference
                                        : null
                                }
                                onSelect={() => onSelectArtist(artist)}
                            />
                        )
                    })}
                </div>

                {canScrollLeft && (
                    <button
                        type='button'
                        onClick={() => scroll('left')}
                        className={cn(
                            'absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full',
                            'bg-lucky-bg-active/80 hover:bg-lucky-bg-active transition-colors',
                            'opacity-0 group-hover:opacity-100 transition-opacity',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand',
                        )}
                        aria-label='Scroll left'
                    >
                        <ChevronLeft className='h-5 w-5 text-lucky-text-primary' />
                    </button>
                )}

                {canScrollRight && (
                    <button
                        type='button'
                        onClick={() => scroll('right')}
                        className={cn(
                            'absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full',
                            'bg-lucky-bg-active/80 hover:bg-lucky-bg-active transition-colors',
                            'opacity-0 group-hover:opacity-100 transition-opacity',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand',
                        )}
                        aria-label='Scroll right'
                    >
                        <ChevronRight className='h-5 w-5 text-lucky-text-primary' />
                    </button>
                )}
            </div>
        </div>
    )
}

interface ArtistTileProps {
    artist: SpotifyArtist
    preference: 'prefer' | 'block' | null
    onSelect: () => void
}

function ArtistTile({ artist, preference, onSelect }: ArtistTileProps) {
    const prefersReducedMotion = useReducedMotion()

    return (
        <button
            type='button'
            onClick={onSelect}
            className={cn(
                'group shrink-0 flex flex-col items-center gap-2 rounded-xl p-3',
                'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand',
                'hover:bg-lucky-bg-tertiary active:scale-95',
            )}
        >
            <div
                className={cn(
                    'relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-2 transition-all duration-200',
                    preference === 'prefer'
                        ? 'ring-lucky-success'
                        : preference === 'block'
                          ? 'ring-lucky-error'
                          : 'ring-lucky-border group-hover:ring-lucky-brand',
                    !prefersReducedMotion && 'group-hover:scale-105',
                )}
            >
                {artist.imageUrl ? (
                    <img
                        src={artist.imageUrl}
                        alt={artist.name}
                        className='w-full h-full object-cover'
                        loading='lazy'
                    />
                ) : (
                    <div className='w-full h-full bg-lucky-bg-active flex items-center justify-center'>
                        <span className='font-semibold text-lucky-text-secondary text-xl'>
                            {artist.name.charAt(0).toUpperCase()}
                        </span>
                    </div>
                )}
                {preference && (
                    <span
                        className={cn(
                            'absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full text-white text-xs font-bold',
                            preference === 'prefer'
                                ? 'bg-lucky-success'
                                : 'bg-lucky-error',
                        )}
                    >
                        {preference === 'prefer' ? '✓' : '✕'}
                    </span>
                )}
            </div>
            <span className='max-w-[110px] text-center text-xs font-medium leading-tight text-lucky-text-secondary group-hover:text-lucky-text-primary transition-colors line-clamp-2'>
                {artist.name}
            </span>
            {artist.genres.length > 0 && (
                <span className='max-w-[110px] text-center text-[10px] text-lucky-text-subtle line-clamp-1'>
                    {artist.genres[0]}
                </span>
            )}
        </button>
    )
}
