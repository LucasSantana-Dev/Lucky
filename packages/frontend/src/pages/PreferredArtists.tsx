import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    Heart,
    Loader2,
    Music2,
    Search,
    X,
    Check,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import type { SpotifyArtist, ArtistPreference } from '@/services/artistsApi'
import SectionHeader from '@/components/ui/SectionHeader'
import EmptyState from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'

function normalizeArtistKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface ArtistTileProps {
    artist: SpotifyArtist
    size?: 'sm' | 'md' | 'lg' | 'xl'
    active?: boolean
    preference?: 'prefer' | 'block' | null
    onClick?: () => void
    onPrefer?: () => void
    onBlock?: () => void
}

function ArtistTile({
    artist,
    size = 'md',
    active = false,
    preference,
    onClick,
    onPrefer,
    onBlock,
}: ArtistTileProps) {
    const [isHovered, setIsHovered] = useState(false)
    const prefersReducedMotion = useReducedMotion()

    const sizeClasses = {
        sm: 'w-14 h-14',
        md: 'w-20 h-20',
        lg: 'w-24 h-24',
        xl: 'w-32 h-32',
    }

    const textSize = {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
        xl: 'text-base',
    }

    const initial = artist.name.charAt(0).toUpperCase()

    // Determine ring color based on hover state and preference
    const getRingColor = () => {
        if (active) return 'ring-lucky-brand'
        if (preference === 'prefer') return 'ring-lucky-success'
        if (preference === 'block') return 'ring-lucky-error'
        return isHovered ? 'ring-lucky-brand' : 'ring-lucky-border'
    }

    return (
        <button
            type='button'
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={cn(
                'flex flex-col items-center gap-2 rounded-xl p-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand',
                active ? 'bg-lucky-bg-active' : isHovered ? 'bg-lucky-bg-tertiary' : 'hover:bg-lucky-bg-tertiary',
                !onClick && 'cursor-default',
            )}
        >
            <div
                className={cn(
                    'relative shrink-0 rounded-full overflow-hidden ring-2 transition-all duration-150',
                    sizeClasses[size],
                    getRingColor(),
                    !prefersReducedMotion && isHovered && 'scale-105',
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
                        <span className='font-semibold text-lucky-text-secondary'>
                            {initial}
                        </span>
                    </div>
                )}
                {/* Already-preferred indicator overlay */}
                {preference === 'prefer' && (
                    <>
                        <div className='absolute inset-0 bg-white/20 flex items-center justify-center'>
                            <Check className='h-8 w-8 text-white drop-shadow-lg' />
                        </div>
                    </>
                )}
                {preference === 'block' && (
                    <>
                        <div className='absolute inset-0 bg-red-500/20 flex items-center justify-center'>
                            <X className='h-8 w-8 text-white drop-shadow-lg' />
                        </div>
                    </>
                )}
                {/* Hover action buttons */}
                {(onPrefer || onBlock) && isHovered && (
                    <>
                        {onPrefer && (
                            <button
                                type='button'
                                aria-label='Prefer'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onPrefer()
                                }}
                                className='absolute top-2 left-2 rounded-full bg-lucky-bg-primary/90 p-1.5 ring-1 ring-lucky-border hover:bg-lucky-brand transition-colors'
                            >
                                <Heart className='h-4 w-4 text-lucky-brand' />
                            </button>
                        )}
                        {onBlock && (
                            <button
                                type='button'
                                aria-label='Block'
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onBlock()
                                }}
                                className='absolute top-2 right-2 rounded-full bg-lucky-bg-primary/90 p-1.5 ring-1 ring-lucky-border hover:bg-lucky-error transition-colors'
                            >
                                <X className='h-4 w-4 text-lucky-error' />
                            </button>
                        )}
                    </>
                )}
            </div>
            <span
                className={cn(
                    'max-w-[80px] text-center leading-tight font-medium line-clamp-2',
                    textSize[size],
                    active
                        ? 'text-lucky-text-primary'
                        : 'text-lucky-text-secondary transition-colors duration-150',
                    isHovered && 'text-lucky-text-primary',
                )}
            >
                {artist.name}
            </span>
        </button>
    )
}


export default function PreferredArtistsPage() {
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id
    const prefersReducedMotion = useReducedMotion()
    const [searchParams, setSearchParams] = useSearchParams()
    const currentTab = (searchParams.get('tab') || 'discover') as 'discover' | 'preferred' | 'blocked'

    const [query, setQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SpotifyArtist[]>([])
    const [searching, setSearching] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)

    const [suggestionsLoading, setSuggestionsLoading] = useState(true)
    const [suggestionsError, setSuggestionsError] = useState<string | null>(null)

    const [savedPreferences, setSavedPreferences] = useState<
        Map<string, ArtistPreference>
    >(new Map())

    // Flat feed model: feedArtists contains all artists (suggestions + expanded children)
    const [feedArtists, setFeedArtists] = useState<SpotifyArtist[]>([])
    const [feedChildren, setFeedChildren] = useState<Map<string, string[]>>(new Map())
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const [unsavedChanges, setUnsavedChanges] = useState<
        Map<string, { preference: 'prefer' | 'block'; artist: SpotifyArtist }>
    >(new Map())
    const [isSaving, setIsSaving] = useState(false)

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const loadPreferences = useCallback(async () => {
        if (!guildId) return
        try {
            const res = await api.artists.getPreferences(guildId)
            const map = new Map<string, ArtistPreference>()
            for (const p of res.data.preferences) {
                map.set(p.artistKey, p)
            }
            setSavedPreferences(map)
        } catch {
            // non-critical
        }
    }, [guildId])

    const loadSuggestions = useCallback(async () => {
        setSuggestionsLoading(true)
        setSuggestionsError(null)
        try {
            const res = await api.artists.getSuggestions()
            setFeedArtists(res.data.artists)
        } catch (err) {
            setFeedArtists([])
            setSuggestionsError(
                err instanceof ApiError
                    ? err.message
                    : 'Failed to load suggestions',
            )
        } finally {
            setSuggestionsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadPreferences()
        loadSuggestions()
    }, [loadPreferences, loadSuggestions])

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        const trimmed = query.trim()
        if (!trimmed) {
            setSearchResults([])
            setSearchError(null)
            return
        }
        debounceRef.current = setTimeout(async () => {
            setSearching(true)
            setSearchError(null)
            try {
                const res = await api.artists.search(trimmed)
                setSearchResults(res.data.artists)
            } catch {
                setSearchError('Failed to search artists')
                setSearchResults([])
            } finally {
                setSearching(false)
            }
        }, 400)
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [query])

    // Recursively collapse an expanded artist and its descendants
    const collapse = useCallback((parentId: string) => {
        const toRemove = new Set<string>([parentId])
        const queue = [parentId]
        while (queue.length > 0) {
            const id = queue.shift()!
            const childIds = feedChildren.get(id) ?? []
            for (const childId of childIds) {
                toRemove.add(childId)
                queue.push(childId)
            }
        }
        setFeedArtists((prev) => prev.filter((a) => !toRemove.has(a.id)))
        setExpanded((prev) => {
            const next = new Set(prev)
            next.delete(parentId)
            return next
        })
        setFeedChildren((prev) => {
            const next = new Map(prev)
            for (const id of toRemove) {
                next.delete(id)
            }
            return next
        })
    }, [feedChildren])

    const expandArtist = useCallback(
        async (artist: SpotifyArtist) => {
            // If already expanded, collapse it
            if (expanded.has(artist.id)) {
                collapse(artist.id)
                return
            }

            // Load and insert related artists
            setLoadingId(artist.id)
            try {
                const res = await api.artists.getRelated(artist.id)

                // Build set of existing artist keys
                const existingKeys = new Set<string>()
                for (const a of feedArtists) {
                    existingKeys.add(normalizeArtistKey(a.name))
                }
                for (const key of savedPreferences.keys()) {
                    existingKeys.add(key)
                }
                for (const key of unsavedChanges.keys()) {
                    existingKeys.add(key)
                }

                // Filter related artists
                const filteredArtists = res.data.artists.filter((relatedArtist) => {
                    const k = normalizeArtistKey(relatedArtist.name)
                    return !existingKeys.has(k)
                })

                // Find artist index in feedArtists and splice in children
                const artistIndex = feedArtists.findIndex((a) => a.id === artist.id)
                if (artistIndex >= 0 && filteredArtists.length > 0) {
                    setFeedArtists((prev) => {
                        const next = [...prev]
                        next.splice(artistIndex + 1, 0, ...filteredArtists)
                        return next
                    })

                    setFeedChildren((prev) => {
                        const next = new Map(prev)
                        next.set(artist.id, filteredArtists.map((a) => a.id))
                        return next
                    })
                }

                setExpanded((prev) => new Set(prev).add(artist.id))
            } catch {
                // silently fail - user can try again
            } finally {
                setLoadingId(null)
            }
        },
        [feedArtists, expanded, savedPreferences, unsavedChanges, collapse],
    )

    const togglePreference = useCallback(
        (artist: SpotifyArtist, preference: 'prefer' | 'block') => {
            const key = normalizeArtistKey(artist.name)
            setUnsavedChanges((prev) => {
                const next = new Map(prev)
                const current = next.get(key)?.preference
                if (current === preference) {
                    // Remove if same preference already pending
                    next.delete(key)
                } else {
                    // Set new preference (overwrites opposite)
                    next.set(key, { preference, artist })
                }
                return next
            })
        },
        [],
    )

    const handleSavePreferences = useCallback(async () => {
        if (!guildId || unsavedChanges.size === 0) return
        setIsSaving(true)
        try {
            const items = Array.from(unsavedChanges.entries()).map(
                ([_key, { preference, artist }]) => ({
                    artistId: artist.id,
                    artistKey: _key,
                    artistName: artist.name,
                    imageUrl: artist.imageUrl,
                    preference,
                }),
            )
            await api.artists.savePreferencesBatch({
                guildId,
                items,
            })
            await loadPreferences()
            setUnsavedChanges(new Map())
        } catch {
            // error handling could be improved with a toast
        } finally {
            setIsSaving(false)
        }
    }, [guildId, unsavedChanges, loadPreferences])

    const blockedArtists = [...savedPreferences.values()].filter(
        (p) => p.preference === 'block',
    )

    const preferredArtists = [...savedPreferences.values()].filter(
        (p) => p.preference === 'prefer',
    )

    const displayArtists = query.trim() ? searchResults : feedArtists

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Music2 className='h-10 w-10' aria-hidden='true' />}
                title='No Server Selected'
                description='Select a server to manage preferred artists'
            />
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                eyebrow='Music personalization'
                title='Musical Taste'
                description="Choose artists to guide autoplay recommendations. When multiple people are in voice, Lucky blends everyone's preferences."
                actions={<Heart className='h-5 w-5 text-lucky-accent' />}
            />

            {/* Tab Buttons */}
            <div className='surface-panel p-4'>
                <div className='flex gap-2'>
                    {(['discover', 'preferred', 'blocked'] as const).map((tab) => {
                        const counts = {
                            discover: feedArtists.length,
                            preferred: preferredArtists.length,
                            blocked: blockedArtists.length,
                        }
                        return (
                            <button
                                key={tab}
                                type='button'
                                onClick={() => setSearchParams({ tab })}
                                className={cn(
                                    'px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
                                    currentTab === tab
                                        ? 'bg-lucky-brand text-white'
                                        : 'bg-lucky-bg-tertiary text-lucky-text-secondary hover:bg-lucky-bg-active',
                                )}
                            >
                                <span className='capitalize'>
                                    {tab === 'discover' && 'Discover'}
                                    {tab === 'preferred' && 'Preferred'}
                                    {tab === 'blocked' && 'Blocked'}
                                </span>
                                <span
                                    className={cn(
                                        'inline-flex items-center justify-center h-5 px-1.5 rounded-full text-xs font-medium',
                                        currentTab === tab
                                            ? 'bg-white/20 text-white'
                                            : 'bg-lucky-brand/20 text-lucky-brand',
                                    )}
                                >
                                    {counts[tab]}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className='space-y-4'>
                    {/* Discover Tab */}
                    {currentTab === 'discover' && (
                        <div className='surface-panel p-4'>
                        <div className='relative'>
                            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lucky-text-subtle' />
                            <input
                                type='text'
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder='Search for an artist...'
                                className='lucky-focus-visible w-full rounded-lg border border-lucky-border bg-lucky-bg-tertiary py-2.5 pl-9 pr-10 type-body-sm text-lucky-text-primary placeholder:text-lucky-text-subtle focus:border-lucky-brand focus:bg-lucky-bg-primary'
                            />
                            {query && (
                                <button
                                    type='button'
                                    onClick={() => setQuery('')}
                                    className='absolute right-3 top-1/2 -translate-y-1/2 text-lucky-text-subtle hover:text-lucky-text-primary'
                                >
                                    <X className='h-3.5 w-3.5' />
                                </button>
                            )}
                        </div>

                        {searching && (
                            <div className='flex items-center justify-center py-6'>
                                <Loader2 className='h-5 w-5 animate-spin text-lucky-text-tertiary' />
                            </div>
                        )}

                        {searchError && (
                            <p className='mt-3 type-body-sm text-lucky-error'>
                                {searchError}
                            </p>
                        )}

                        {!searching &&
                            query.trim() &&
                            searchResults.length === 0 &&
                            !searchError && (
                                <p className='mt-3 type-body-sm text-lucky-text-tertiary'>
                                    No artists found for "{query}"
                                </p>
                            )}

                        {!searching &&
                            !query.trim() &&
                            suggestionsLoading && (
                                <div className='flex items-center justify-center py-6'>
                                    <Loader2 className='h-5 w-5 animate-spin text-lucky-text-tertiary' />
                                </div>
                            )}

                        {!searching && displayArtists.length > 0 && (
                            <motion.div
                                layout
                                className='mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'
                            >
                                <AnimatePresence mode='popLayout'>
                                    {displayArtists.map((artist) => {
                                        const key = normalizeArtistKey(artist.name)
                                        const unsaved =
                                            unsavedChanges.get(key)?.preference ?? null
                                        const pref =
                                            unsaved ??
                                            savedPreferences.get(key)?.preference ??
                                            null
                                        const isExpanded = expanded.has(artist.id)
                                        const isLoading = loadingId === artist.id

                                        return (
                                            <motion.div
                                                key={artist.id + key}
                                                layout
                                                initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
                                                animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1 }}
                                                exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
                                                transition={prefersReducedMotion ? {} : { duration: 0.2 }}
                                            >
                                                <ArtistTile
                                                    artist={artist}
                                                    size='xl'
                                                    active={isExpanded || isLoading}
                                                    preference={pref}
                                                    onClick={() =>
                                                        expandArtist(artist)
                                                    }
                                                    onPrefer={() => togglePreference(artist, 'prefer')}
                                                    onBlock={() => togglePreference(artist, 'block')}
                                                />
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>
                            </motion.div>
                        )}

                        {!searching &&
                            !query.trim() &&
                            suggestionsError &&
                            !suggestionsLoading && (
                                <div className='py-6 text-center space-y-3'>
                                    <p className='type-body-sm text-lucky-error'>
                                        {suggestionsError}
                                    </p>
                                    <button
                                        type='button'
                                        onClick={loadSuggestions}
                                        className='lucky-focus-visible rounded-lg bg-lucky-brand px-4 py-2 type-body-sm font-medium text-white hover:bg-lucky-brand/90'
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                        {!query.trim() &&
                            displayArtists.length === 0 &&
                            !suggestionsLoading &&
                            !suggestionsError && (
                                <div className='py-6 text-center'>
                                    <p className='type-body-sm text-lucky-text-tertiary'>
                                        No suggestions available. Try searching
                                        for artists above.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Preferred Tab */}
                    {currentTab === 'preferred' && (
                        <div className='surface-panel p-4'>
                            {preferredArtists.length === 0 ? (
                                <EmptyState
                                    icon={<Heart className='h-10 w-10' aria-hidden='true' />}
                                    title='No preferred artists yet'
                                    description='Add some from Discover.'
                                />
                            ) : (
                                <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'>
                                    {preferredArtists.map((pref) => {
                                        const artist = prefToArtist(pref)
                                        return (
                                            <div key={pref.id} className='transition-opacity'>
                                                <ArtistTile
                                                    artist={artist}
                                                    size='lg'
                                                    preference='prefer'
                                                    onClick={async () => {
                                                        if (!guildId) return
                                                        const artistKey = normalizeArtistKey(pref.artistName)
                                                        await api.artists.deletePreference(artistKey, guildId)
                                                        await loadPreferences()
                                                    }}
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Blocked Tab */}
                    {currentTab === 'blocked' && (
                        <div className='surface-panel p-4'>
                            {blockedArtists.length === 0 ? (
                                <EmptyState
                                    icon={<X className='h-10 w-10' aria-hidden='true' />}
                                    title='No blocked artists'
                                    description="Block artists you don't want Lucky to autoplay."
                                />
                            ) : (
                                <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'>
                                    {blockedArtists.map((pref) => {
                                        const artist = prefToArtist(pref)
                                        return (
                                            <div key={pref.id} className='transition-opacity'>
                                                <ArtistTile
                                                    artist={artist}
                                                    size='lg'
                                                    preference='block'
                                                    onClick={async () => {
                                                        if (!guildId) return
                                                        const artistKey = normalizeArtistKey(pref.artistName)
                                                        await api.artists.deletePreference(artistKey, guildId)
                                                        await loadPreferences()
                                                    }}
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {unsavedChanges.size > 0 && (
                        <button
                            type='button'
                            onClick={handleSavePreferences}
                            disabled={isSaving}
                            className={cn(
                                'lucky-focus-visible w-full rounded-lg px-4 py-2.5 type-body-sm font-medium transition-colors',
                                isSaving
                                    ? 'bg-lucky-brand/50 text-white'
                                    : 'bg-lucky-brand text-white hover:bg-lucky-brand/90',
                            )}
                        >
                            {isSaving ? (
                                <div className='flex items-center justify-center gap-2'>
                                    <Loader2 className='h-4 w-4 animate-spin' />
                                    Saving...
                                </div>
                            ) : (
                                `Save Preferences (${unsavedChanges.size})`
                            )}
                        </button>
                    )}
            </div>
        </div>
    )
}

function prefToArtist(pref: ArtistPreference): SpotifyArtist {
    return {
        id: pref.spotifyId ?? pref.artistKey,
        name: pref.artistName,
        imageUrl: pref.imageUrl,
        popularity: 0,
        genres: [],
    }
}
