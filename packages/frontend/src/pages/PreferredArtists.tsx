import { useCallback, useEffect, useRef, useState } from 'react'
import {
    Heart,
    Loader2,
    Music2,
    Search,
    UserX,
    X,
    ChevronRight,
} from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'
import type { SpotifyArtist, ArtistPreference } from '@/services/artistsApi'
import SectionHeader from '@/components/ui/SectionHeader'
import EmptyState from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'

function normalizeArtistKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function ArtistAvatar({
    artist,
    size = 'md',
    active = false,
    preference,
    onClick,
}: {
    artist: SpotifyArtist
    size?: 'sm' | 'md' | 'lg' | 'xl'
    active?: boolean
    preference?: 'prefer' | 'block' | null
    onClick?: () => void
}) {
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

    return (
        <button
            type='button'
            onClick={onClick}
            className={cn(
                'group flex flex-col items-center gap-2 rounded-xl p-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-lucky-brand',
                active ? 'bg-lucky-bg-active' : 'hover:bg-lucky-bg-tertiary',
                !onClick && 'cursor-default',
            )}
        >
            <div
                className={cn(
                    'relative shrink-0 rounded-full overflow-hidden ring-2 transition-all duration-150',
                    sizeClasses[size],
                    active
                        ? 'ring-lucky-brand'
                        : preference === 'prefer'
                          ? 'ring-lucky-success'
                          : preference === 'block'
                            ? 'ring-lucky-error'
                            : 'ring-lucky-border group-hover:ring-lucky-border-strong',
                )}
            >
                {artist.imageUrl ? (
                    <img
                        src={artist.imageUrl}
                        alt={artist.name}
                        className='w-full h-full object-cover'
                    />
                ) : (
                    <div className='w-full h-full bg-lucky-bg-active flex items-center justify-center'>
                        <span className='font-semibold text-lucky-text-secondary'>
                            {initial}
                        </span>
                    </div>
                )}
                {preference === 'prefer' && (
                    <span className='absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-lucky-success'>
                        <Heart className='h-2.5 w-2.5 fill-white text-white' />
                    </span>
                )}
                {preference === 'block' && (
                    <span className='absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-lucky-error'>
                        <X className='h-2.5 w-2.5 text-white' />
                    </span>
                )}
            </div>
            <span
                className={cn(
                    'max-w-[80px] text-center leading-tight font-medium line-clamp-2',
                    textSize[size],
                    active
                        ? 'text-lucky-text-primary'
                        : 'text-lucky-text-secondary group-hover:text-lucky-text-primary',
                )}
            >
                {artist.name}
            </span>
        </button>
    )
}

interface ArtistDetailPanelProps {
    artist: SpotifyArtist
    preference: 'prefer' | 'block' | null
    relatedArtists: SpotifyArtist[]
    relatedLoading: boolean
    savedPreferences: Map<string, ArtistPreference>
    onTogglePreference: (
        artist: SpotifyArtist,
        pref: 'prefer' | 'block',
    ) => void
    onRemovePreference: (artist: SpotifyArtist) => void
    onSelectRelated: (artist: SpotifyArtist) => void
    onClose: () => void
}

function ArtistDetailPanel({
    artist,
    preference,
    relatedArtists,
    relatedLoading,
    savedPreferences,
    onTogglePreference,
    onRemovePreference,
    onSelectRelated,
    onClose,
}: ArtistDetailPanelProps) {
    return (
        <div className='surface-panel flex flex-col gap-4 p-5'>
            <div className='flex items-start justify-between gap-3'>
                <div className='flex items-center gap-3'>
                    <div className='h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-lucky-border'>
                        {artist.imageUrl ? (
                            <img
                                src={artist.imageUrl}
                                alt={artist.name}
                                className='h-full w-full object-cover'
                            />
                        ) : (
                            <div className='flex h-full w-full items-center justify-center bg-lucky-bg-active'>
                                <span className='text-sm font-semibold text-lucky-text-secondary'>
                                    {artist.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>
                    <div>
                        <p className='type-title text-lucky-text-primary'>
                            {artist.name}
                        </p>
                        {artist.genres.length > 0 && (
                            <p className='type-body-sm text-lucky-text-tertiary capitalize'>
                                {artist.genres.slice(0, 2).join(' · ')}
                            </p>
                        )}
                    </div>
                </div>
                <button
                    type='button'
                    onClick={onClose}
                    className='lucky-focus-visible rounded-md p-1 text-lucky-text-subtle transition-colors hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary'
                    aria-label='Close panel'
                >
                    <X className='h-4 w-4' />
                </button>
            </div>

            <div className='flex gap-2'>
                <button
                    type='button'
                    onClick={() =>
                        preference === 'prefer'
                            ? onRemovePreference(artist)
                            : onTogglePreference(artist, 'prefer')
                    }
                    className={cn(
                        'lucky-focus-visible inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 type-body-sm font-medium transition-colors',
                        preference === 'prefer'
                            ? 'border-lucky-success/40 bg-lucky-success/20 text-lucky-success hover:bg-lucky-success/30'
                            : 'border-lucky-border bg-lucky-bg-tertiary text-lucky-text-secondary hover:border-lucky-success/40 hover:bg-lucky-success/10 hover:text-lucky-success',
                    )}
                >
                    <Heart
                        className={cn(
                            'h-4 w-4',
                            preference === 'prefer' && 'fill-lucky-success',
                        )}
                    />
                    {preference === 'prefer' ? 'Preferred' : 'Prefer'}
                </button>
                <button
                    type='button'
                    onClick={() =>
                        preference === 'block'
                            ? onRemovePreference(artist)
                            : onTogglePreference(artist, 'block')
                    }
                    className={cn(
                        'lucky-focus-visible inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 type-body-sm font-medium transition-colors',
                        preference === 'block'
                            ? 'border-lucky-error/40 bg-lucky-error/20 text-lucky-error hover:bg-lucky-error/30'
                            : 'border-lucky-border bg-lucky-bg-tertiary text-lucky-text-secondary hover:border-lucky-error/40 hover:bg-lucky-error/10 hover:text-lucky-error',
                    )}
                >
                    <UserX className='h-4 w-4' />
                    {preference === 'block' ? 'Blocked' : 'Block'}
                </button>
            </div>

            <div>
                <p className='mb-3 type-body-sm font-semibold text-lucky-text-secondary uppercase tracking-wide text-[10px]'>
                    Related Artists
                </p>
                {relatedLoading ? (
                    <div className='flex justify-center py-6'>
                        <Loader2 className='h-5 w-5 animate-spin text-lucky-text-tertiary' />
                    </div>
                ) : relatedArtists.length === 0 ? (
                    <p className='type-body-sm text-lucky-text-tertiary'>
                        No related artists found
                    </p>
                ) : (
                    <div className='space-y-1'>
                        {relatedArtists.slice(0, 8).map((related) => {
                            const relKey = normalizeArtistKey(related.name)
                            const relPref = savedPreferences.get(relKey)
                            return (
                                <button
                                    key={related.id}
                                    type='button'
                                    onClick={() => onSelectRelated(related)}
                                    className='lucky-focus-visible group flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-lucky-bg-tertiary'
                                >
                                    <div className='h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-lucky-border'>
                                        {related.imageUrl ? (
                                            <img
                                                src={related.imageUrl}
                                                alt={related.name}
                                                className='h-full w-full object-cover'
                                            />
                                        ) : (
                                            <div className='flex h-full w-full items-center justify-center bg-lucky-bg-active text-xs font-semibold text-lucky-text-secondary'>
                                                {related.name
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className='min-w-0 flex-1 text-left'>
                                        <p className='type-body-sm truncate font-medium text-lucky-text-primary'>
                                            {related.name}
                                        </p>
                                        {related.genres.length > 0 && (
                                            <p className='text-[11px] truncate capitalize text-lucky-text-tertiary'>
                                                {related.genres[0]}
                                            </p>
                                        )}
                                    </div>
                                    {relPref && (
                                        <span
                                            className={cn(
                                                'text-[10px] font-semibold uppercase',
                                                relPref.preference === 'prefer'
                                                    ? 'text-lucky-success'
                                                    : 'text-lucky-error',
                                            )}
                                        >
                                            {relPref.preference}
                                        </span>
                                    )}
                                    <ChevronRight className='h-3.5 w-3.5 shrink-0 text-lucky-text-subtle opacity-0 transition-opacity group-hover:opacity-100' />
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default function PreferredArtistsPage() {
    const { selectedGuild } = useGuildSelection()
    const guildId = selectedGuild?.id

    const [query, setQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SpotifyArtist[]>([])
    const [searching, setSearching] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)

    const [suggestedArtists, setSuggestedArtists] = useState<SpotifyArtist[]>([])
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)

    const [savedPreferences, setSavedPreferences] = useState<
        Map<string, ArtistPreference>
    >(new Map())

    const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(
        null,
    )
    const [relatedArtists, setRelatedArtists] = useState<SpotifyArtist[]>([])
    const [relatedLoading, setRelatedLoading] = useState(false)

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
        try {
            const res = await api.artists.getSuggestions()
            setSuggestedArtists(res.data.artists)
        } catch {
            setSuggestedArtists([])
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

    const selectArtist = useCallback(async (artist: SpotifyArtist) => {
        setSelectedArtist(artist)
        setRelatedArtists([])
        setRelatedLoading(true)
        try {
            const res = await api.artists.getRelated(artist.id)
            setRelatedArtists(res.data.artists)
        } catch {
            setRelatedArtists([])
        } finally {
            setRelatedLoading(false)
        }
    }, [])

    const handleTogglePreference = useCallback(
        (artist: SpotifyArtist, pref: 'prefer' | 'block') => {
            const key = normalizeArtistKey(artist.name)
            setUnsavedChanges((prev) => {
                const next = new Map(prev)
                next.set(key, { preference: pref, artist })
                return next
            })
        },
        [],
    )

    const handleRemovePreference = useCallback((artist: SpotifyArtist) => {
        const key = normalizeArtistKey(artist.name)
        setUnsavedChanges((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
        })
    }, [])

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

    const selectedPreference = selectedArtist
        ? (unsavedChanges.get(normalizeArtistKey(selectedArtist.name))
                ?.preference ??
            savedPreferences.get(normalizeArtistKey(selectedArtist.name))
                ?.preference ??
            null)
        : null

    const displayArtists = query.trim() ? searchResults : suggestedArtists

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
                title='Preferred Artists'
                description="Choose artists to guide autoplay recommendations. When multiple people are in voice, Lucky blends everyone's preferences."
                actions={<Heart className='h-5 w-5 text-lucky-accent' />}
            />

            <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
                <div className='min-w-0 flex-1 space-y-4'>
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
                            <div className='mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'>
                                {displayArtists.map((artist) => {
                                    const key = normalizeArtistKey(artist.name)
                                    const unsaved =
                                        unsavedChanges.get(key)?.preference ?? null
                                    const pref =
                                        unsaved ??
                                        savedPreferences.get(key)?.preference ??
                                        null
                                    return (
                                        <div
                                            key={artist.id + key}
                                            className='transition-opacity'
                                        >
                                            <ArtistAvatar
                                                artist={artist}
                                                size='xl'
                                                active={
                                                    selectedArtist?.id ===
                                                    artist.id
                                                }
                                                preference={pref}
                                                onClick={() =>
                                                    selectArtist(artist)
                                                }
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {!query.trim() &&
                            displayArtists.length === 0 &&
                            !suggestionsLoading && (
                                <div className='py-6 text-center'>
                                    <p className='type-body-sm text-lucky-text-tertiary'>
                                        No suggestions available. Try searching
                                        for artists above.
                                    </p>
                                </div>
                            )}
                    </div>

                    {blockedArtists.length > 0 && (
                        <div className='surface-panel p-4'>
                            <p className='mb-3 text-[10px] font-semibold uppercase tracking-wide text-lucky-text-subtle'>
                                Blocked Artists
                            </p>
                            <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5'>
                                {blockedArtists.map((pref) => {
                                    const artist = prefToArtist(pref)
                                    return (
                                        <div key={pref.id} className='transition-opacity'>
                                            <ArtistAvatar
                                                artist={artist}
                                                size='xl'
                                                active={
                                                    selectedArtist?.id ===
                                                        artist.id ||
                                                    (selectedArtist === null &&
                                                        normalizeArtistKey(
                                                            artist.name,
                                                        ) === pref.artistKey)
                                                }
                                                preference='block'
                                                onClick={() =>
                                                    selectArtist(artist)
                                                }
                                            />
                                        </div>
                                    )
                                })}
                            </div>
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

                {selectedArtist && (
                    <div className='w-full lg:w-80 xl:w-72 xl:shrink-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto'>
                        <ArtistDetailPanel
                            artist={selectedArtist}
                            preference={selectedPreference}
                            relatedArtists={relatedArtists}
                            relatedLoading={relatedLoading}
                            savedPreferences={savedPreferences}
                            onTogglePreference={handleTogglePreference}
                            onRemovePreference={handleRemovePreference}
                            onSelectRelated={selectArtist}
                            onClose={() => setSelectedArtist(null)}
                        />
                    </div>
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
