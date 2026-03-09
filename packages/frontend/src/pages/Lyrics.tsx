import { useState, FormEvent } from 'react'
import { MicVocal, Search } from 'lucide-react'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'

interface LyricsResult {
    lyrics: string
    title: string
    artist: string
}

export default function LyricsPage() {
    const { selectedGuild } = useGuildSelection()
    const [title, setTitle] = useState('')
    const [artist, setArtist] = useState('')
    const [result, setResult] = useState<LyricsResult | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hasSearched, setHasSearched] = useState(false)

    const handleSearch = async (e: FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return

        setIsLoading(true)
        setError(null)
        setResult(null)
        setHasSearched(true)

        try {
            const response = await api.lyrics.search(
                title.trim(),
                artist.trim() || undefined,
            )
            setResult(response.data)
        } catch {
            setError('Failed to fetch lyrics. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-64 text-lucky-text-secondary'>
                <MicVocal className='h-12 w-12 mb-4 opacity-50' />
                <p className='text-lg'>Select a server to search lyrics</p>
            </div>
        )
    }

    return (
        <div className='space-y-6 px-1 sm:px-0'>
            <header className='flex items-center gap-3'>
                <MicVocal className='h-6 w-6 text-lucky-red' />
                <h1 className='text-xl font-bold text-white'>Lyrics Search</h1>
            </header>

            <form
                onSubmit={handleSearch}
                className='p-4 rounded-lg bg-lucky-bg-tertiary border border-lucky-border space-y-3'
            >
                <div className='space-y-1.5'>
                    <label
                        htmlFor='title'
                        className='text-sm font-medium text-lucky-text-secondary'
                    >
                        Song Title <span className='text-lucky-red'>*</span>
                    </label>
                    <input
                        id='title'
                        type='text'
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder='Enter song title'
                        className='w-full px-3 py-2 rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:ring-2 focus:ring-lucky-red/50 transition-all'
                        required
                    />
                </div>

                <div className='space-y-1.5'>
                    <label
                        htmlFor='artist'
                        className='text-sm font-medium text-lucky-text-secondary'
                    >
                        Artist (optional)
                    </label>
                    <input
                        id='artist'
                        type='text'
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        placeholder='Enter artist name'
                        className='w-full px-3 py-2 rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:ring-2 focus:ring-lucky-red/50 transition-all'
                    />
                </div>

                <button
                    type='submit'
                    disabled={isLoading || !title.trim()}
                    className='w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-lucky-red hover:bg-lucky-red/90 disabled:bg-lucky-red/50 disabled:cursor-not-allowed text-white font-medium transition-colors'
                >
                    <Search className='w-4 h-4' />
                    {isLoading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {error && (
                <div className='p-3 rounded-lg bg-lucky-error/10 text-lucky-error text-sm'>
                    {error}
                </div>
            )}

            {isLoading && (
                <div className='space-y-3'>
                    {[...Array(3)].map((_, i) => (
                        <div
                            key={i}
                            className='h-16 rounded-lg bg-lucky-bg-tertiary animate-pulse'
                        />
                    ))}
                </div>
            )}

            {!isLoading && !result && !error && hasSearched && (
                <div className='text-center py-12 text-lucky-text-tertiary'>
                    No lyrics found
                </div>
            )}

            {!isLoading && !result && !error && !hasSearched && (
                <div className='text-center py-12 text-lucky-text-tertiary'>
                    Search for lyrics by entering a song title
                </div>
            )}

            {result && !isLoading && (
                <div className='space-y-4'>
                    <div className='p-4 rounded-lg bg-lucky-bg-tertiary border border-lucky-border'>
                        <h2 className='text-lg font-bold text-white'>
                            {result.title}
                        </h2>
                        <p className='text-sm text-lucky-text-secondary'>
                            {result.artist}
                        </p>
                    </div>

                    <div className='p-4 rounded-lg bg-lucky-bg-tertiary border border-lucky-border'>
                        <pre className='text-sm text-white whitespace-pre-wrap font-mono leading-relaxed'>
                            {result.lyrics}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    )
}
