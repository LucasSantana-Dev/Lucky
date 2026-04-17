import { useState, useEffect } from 'react'
import { Music2, Plus, X, AlertCircle } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import axios from 'axios'
import { inferApiBase } from '@/services/apiBase'

const API_BASE = inferApiBase(
    import.meta.env.VITE_API_BASE_URL,
    typeof globalThis !== 'undefined' && 'window' in globalThis ? globalThis.window.location : undefined,
)

const apiClient = axios.create({
    baseURL: API_BASE,
    withCredentials: true,
})

interface AutoplayGenresProps {
    guildId: string
}

const SUGGESTED_GENRES = [
    'rock',
    'pop',
    'hip-hop',
    'electronic',
    'indie',
    'jazz',
    'classical',
    'metal',
    'r&b',
    'alternative',
]

const MAX_GENRES = 5

export default function AutoplayGenres({ guildId }: AutoplayGenresProps) {
    const [genres, setGenres] = useState<string[]>([])
    const [newGenre, setNewGenre] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (guildId) loadGenres()
    }, [guildId])

    const loadGenres = async () => {
        try {
            setError(null)
            const response = await apiClient.get<{ genres: string[] }>(
                `/api/guilds/${guildId}/autoplay/genres`,
            )
            setGenres(response.data.genres || [])
        } catch (err) {
            console.error('Failed to load genres:', err)
            setError('Failed to load autoplay genres')
        }
    }

    const addGenre = async () => {
        const trimmedGenre = newGenre.toLowerCase().trim()

        if (!trimmedGenre) {
            toast.error('Please enter a genre name')
            return
        }

        if (genres.includes(trimmedGenre)) {
            toast.error('Genre already added')
            return
        }

        if (genres.length >= MAX_GENRES) {
            toast.error(`Maximum ${MAX_GENRES} genres allowed`)
            return
        }

        const updatedGenres = [...genres, trimmedGenre]
        await updateGenres(updatedGenres)
        setNewGenre('')
    }

    const removeGenre = async (genreToRemove: string) => {
        const updatedGenres = genres.filter((g) => g !== genreToRemove)
        await updateGenres(updatedGenres)
    }

    const updateGenres = async (updatedGenres: string[]) => {
        setIsLoading(true)
        try {
            setError(null)
            await apiClient.put(`/api/guilds/${guildId}/autoplay/genres`, {
                genres: updatedGenres,
            })
            setGenres(updatedGenres)
            toast.success('Autoplay genres updated')
        } catch (err) {
            console.error('Failed to update genres:', err)
            setError('Failed to update autoplay genres')
            toast.error('Failed to update autoplay genres')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className='p-6'>
            <div className='flex items-center gap-2 mb-4'>
                <Music2 className='h-5 w-5 text-primary' aria-hidden='true' />
                <h3 className='text-lg font-bold text-white'>
                    Autoplay Genre Preferences
                </h3>
            </div>
            <p className='text-lucky-text-secondary mb-6'>
                Select genres to focus your autoplay recommendations on specific music styles.
                Leave empty for no genre filtering.
            </p>

            {error && (
                <div className='mb-4 flex items-center gap-2 text-yellow-500 text-sm'>
                    <AlertCircle className='h-4 w-4' />
                    {error}
                </div>
            )}

            {/* Current genres */}
            {genres.length > 0 && (
                <div className='mb-6'>
                    <Label className='text-sm font-medium text-lucky-text-primary'>
                        Selected Genres ({genres.length}/{MAX_GENRES})
                    </Label>
                    <div className='flex flex-wrap gap-2 mt-3'>
                        {genres.map((genre) => (
                            <button
                                key={genre}
                                onClick={() => removeGenre(genre)}
                                disabled={isLoading}
                                className='flex items-center gap-2 px-3 py-1 bg-primary/20 rounded-full text-primary hover:bg-primary/30 transition-colors disabled:opacity-50'
                                aria-label={`Remove ${genre} genre`}
                            >
                                <span>{genre}</span>
                                <X className='h-4 w-4' />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Add new genre */}
            <div className='space-y-3'>
                <Label className='text-sm font-medium text-lucky-text-primary'>
                    Add Genre
                </Label>
                <div className='flex gap-2'>
                    <Input
                        type='text'
                        placeholder='e.g., rock, pop, jazz...'
                        value={newGenre}
                        onChange={(e) => setNewGenre(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                addGenre()
                            }
                        }}
                        disabled={isLoading || genres.length >= MAX_GENRES}
                        maxLength={30}
                    />
                    <Button
                        onClick={addGenre}
                        disabled={
                            isLoading ||
                            !newGenre.trim() ||
                            genres.length >= MAX_GENRES
                        }
                        className='whitespace-nowrap'
                    >
                        <Plus className='h-4 w-4' />
                        Add
                    </Button>
                </div>
            </div>

            {/* Suggested genres */}
            {genres.length < MAX_GENRES && (
                <div className='mt-6 pt-6 border-t border-lucky-border'>
                    <Label className='text-sm font-medium text-lucky-text-primary'>
                        Suggested Genres
                    </Label>
                    <div className='flex flex-wrap gap-2 mt-3'>
                        {SUGGESTED_GENRES
                            .filter((g) => !genres.includes(g))
                            .map((genre) => (
                                <button
                                    key={genre}
                                    onClick={() => {
                                        setNewGenre(genre)
                                    }}
                                    disabled={isLoading}
                                    className='px-3 py-1 bg-lucky-border rounded-full text-lucky-text-secondary hover:bg-lucky-border/80 transition-colors disabled:opacity-50'
                                >
                                    {genre}
                                </button>
                            ))}
                    </div>
                </div>
            )}
        </Card>
    )
}
