import { memo, useState, useCallback } from 'react'
import { Import } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface ImportPlaylistProps {
    onImport: (url: string) => Promise<void>
}

const SOURCES = [
    {
        label: 'Spotify',
        cls: 'bg-green-500/10 text-green-400 border-green-500/20',
    },
    { label: 'YouTube', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
    {
        label: 'SoundCloud',
        cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    },
]

export default memo(function ImportPlaylist({ onImport }: ImportPlaylistProps) {
    const [url, setUrl] = useState('')
    const [isImporting, setIsImporting] = useState(false)

    const handleImport = useCallback(async () => {
        if (!url.trim()) return
        setIsImporting(true)
        try {
            await onImport(url.trim())
            toast.success('Playlist imported successfully')
            setUrl('')
        } catch {
            toast.error('Failed to import playlist')
        } finally {
            setIsImporting(false)
        }
    }, [url, onImport])

    return (
        <Card className='p-4 sm:p-6'>
            <div className='flex items-center gap-2 mb-3 sm:mb-4'>
                <Import
                    className='h-5 w-5 text-primary shrink-0'
                    aria-hidden='true'
                />
                <h3 className='type-title text-lucky-text-primary'>
                    Import Playlist
                </h3>
            </div>
            <p className='type-body-sm text-lucky-text-secondary mb-3 sm:mb-4'>
                Import from Spotify, YouTube, or SoundCloud
            </p>
            <form
                className='flex flex-col sm:flex-row gap-2'
                onSubmit={(e) => {
                    e.preventDefault()
                    handleImport()
                }}
                aria-label='Import playlist'
            >
                <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder='Paste playlist URL...'
                    className='flex-1 h-10 sm:h-9 text-base sm:text-sm'
                    aria-label='Playlist URL'
                    autoComplete='off'
                    enterKeyHint='go'
                    inputMode='url'
                />
                <Button
                    type='submit'
                    disabled={!url.trim() || isImporting}
                    loading={isImporting}
                    className='h-10 sm:h-9 px-4 shrink-0'
                >
                    <Import className='h-4 w-4 mr-1.5' aria-hidden='true' />
                    Import
                </Button>
            </form>
            <div
                className='flex flex-wrap gap-1.5 sm:gap-2 mt-3'
                aria-label='Supported platforms'
            >
                {SOURCES.map((s) => (
                    <span
                        key={s.label}
                        className={`text-xs px-2 py-1 rounded border ${s.cls}`}
                    >
                        {s.label}
                    </span>
                ))}
            </div>
        </Card>
    )
})
