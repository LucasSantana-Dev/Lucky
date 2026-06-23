import { useState, FormEvent } from 'react'
import { MicVocal, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'

interface LyricsResult {
    lyrics: string
    title: string
    artist: string
}

export default function LyricsPage() {
    const { t } = useTranslation('lyrics')
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
            setError(t('failedToFetchLyrics'))
        } finally {
            setIsLoading(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-64 text-lucky-text-secondary'>
                <MicVocal className='h-12 w-12 mb-4 opacity-50' />
                <p className='text-lg'>{t('selectServerToSearch')}</p>
            </div>
        )
    }

    return (
        <div className='space-y-6 px-1 sm:px-0'>
            <header className='flex items-center gap-3'>
                <MicVocal className='h-6 w-6 text-lucky-red' />
                <h1 className='type-h2 text-lucky-text-primary'>
                    {t('lyricsSearch')}
                </h1>
            </header>

            <form
                onSubmit={handleSearch}
                className='surface-panel p-4 rounded-lg border border-lucky-border space-y-3'
            >
                <div className='space-y-1.5'>
                    <label
                        htmlFor='title'
                        className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold'
                    >
                        {t('songTitle')}{' '}
                        <span className='text-lucky-red'>{t('required')}</span>
                    </label>
                    <input
                        id='title'
                        type='text'
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t('enterSongTitle')}
                        className='w-full px-3 py-2 rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:ring-2 focus:ring-lucky-red/50 transition-all'
                        required
                    />
                </div>

                <div className='space-y-1.5'>
                    <label
                        htmlFor='artist'
                        className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold'
                    >
                        {t('artist')}
                    </label>
                    <input
                        id='artist'
                        type='text'
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        placeholder={t('enterArtistName')}
                        className='w-full px-3 py-2 rounded-lg bg-lucky-bg-active border border-lucky-border text-white placeholder:text-lucky-text-tertiary focus:outline-none focus:ring-2 focus:ring-lucky-red/50 transition-all'
                    />
                </div>

                <button
                    type='submit'
                    disabled={isLoading || !title.trim()}
                    className='w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-lucky-red hover:bg-lucky-red/90 disabled:bg-lucky-red/50 disabled:cursor-not-allowed text-white font-medium transition-colors'
                >
                    <Search className='w-4 h-4' />
                    {isLoading ? t('searching') : t('search')}
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
                    {t('noLyricsFound')}
                </div>
            )}

            {!isLoading && !result && !error && !hasSearched && (
                <div className='text-center py-12 text-lucky-text-tertiary'>
                    {t('searchForLyrics')}
                </div>
            )}

            {result && !isLoading && (
                <div className='space-y-4'>
                    <div className='surface-panel p-4 rounded-lg border border-lucky-border'>
                        <h2 className='type-body-sm font-bold text-lucky-text-primary'>
                            {result.title}
                        </h2>
                        <p className='type-body-sm text-lucky-text-secondary'>
                            {result.artist}
                        </p>
                    </div>

                    <div className='surface-panel p-4 rounded-lg border border-lucky-border'>
                        <pre className='type-body-sm text-lucky-text-primary whitespace-pre-wrap font-mono leading-relaxed'>
                            {result.lyrics}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    )
}
