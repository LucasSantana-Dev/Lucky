import { memo, useState, useCallback } from 'react'
import { Play, Search } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface SearchBarProps {
    onPlay: (query: string) => Promise<void>
}

export default memo(function SearchBar({ onPlay }: SearchBarProps) {
    const [query, setQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)

    const handlePlay = useCallback(async () => {
        if (!query.trim()) return
        setIsSearching(true)
        try {
            await onPlay(query.trim())
            toast.success('Track added to queue')
            setQuery('')
        } catch {
            toast.error('Failed to play track')
        } finally {
            setIsSearching(false)
        }
    }, [query, onPlay])

    return (
        <Card className='p-4 sm:p-6'>
            <div className='flex items-center gap-2 mb-3 sm:mb-4'>
                <Search
                    className='h-5 w-5 text-primary shrink-0'
                    aria-hidden='true'
                />
                <h3 className='text-base sm:text-lg font-semibold text-white'>
                    Search & Play
                </h3>
            </div>
            <p className='text-xs sm:text-sm text-nexus-text-secondary mb-3 sm:mb-4'>
                Search for a song or paste a YouTube/Spotify URL
            </p>
            <form
                className='flex flex-col sm:flex-row gap-2'
                onSubmit={(e) => {
                    e.preventDefault()
                    handlePlay()
                }}
                role='search'
                aria-label='Search for music'
            >
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder='Song name, artist, or URL...'
                    className='flex-1 h-10 sm:h-9 text-base sm:text-sm'
                    aria-label='Search query'
                    autoComplete='off'
                    enterKeyHint='search'
                />
                <Button
                    type='submit'
                    disabled={!query.trim() || isSearching}
                    loading={isSearching}
                    className='h-10 sm:h-9 px-4 shrink-0'
                >
                    <Play className='h-4 w-4 mr-1.5' aria-hidden='true' />
                    Play
                </Button>
            </form>
        </Card>
    )
})
