import { useState, useEffect, useRef } from 'react'
import { Smile, Loader2 } from 'lucide-react'
import Button from './Button'

interface EmojiPickerProps {
    value: string | null | undefined
    onChange: (emoji: string) => void
    guildId: string
}

// Common emoji categories for quick selection
const EMOJI_CATEGORIES = {
    Popular: [
        '😀',
        '😂',
        '🤣',
        '😊',
        '😍',
        '🔥',
        '💯',
        '✨',
        '🎉',
        '🎊',
        '👍',
        '👌',
        '🙌',
        '💪',
        '👏',
        '🤖',
        '💻',
        '📱',
        '🎮',
        '🎵',
    ],
    Smileys: [
        '😀',
        '😃',
        '😄',
        '😁',
        '😆',
        '😅',
        '🤣',
        '😂',
        '🙂',
        '🙃',
        '😉',
        '😌',
        '😍',
        '🥰',
        '😘',
        '😗',
        '😚',
        '😙',
        '🥲',
        '😋',
    ],
    Hands: [
        '👋',
        '🤚',
        '🖐️',
        '✋',
        '🖖',
        '👌',
        '🤌',
        '🤏',
        '✌️',
        '🤞',
        '🫰',
        '🤟',
        '🤘',
        '🤙',
        '👍',
        '👎',
        '✊',
        '👊',
        '🤛',
        '🤜',
    ],
    Objects: [
        '⚽',
        '🏀',
        '🏈',
        '⚾',
        '🥎',
        '🎾',
        '🏐',
        '🏉',
        '🥏',
        '🎳',
        '🎯',
        '🎮',
        '🎲',
        '🎰',
        '🧩',
        '🚗',
        '🚕',
        '🚙',
        '🚌',
        '🚎',
    ],
    Nature: [
        '🌲',
        '🌳',
        '🌴',
        '🌵',
        '🌾',
        '🌿',
        '☘️',
        '🍀',
        '🎍',
        '🎎',
        '🌍',
        '🌎',
        '🌏',
        '⭐',
        '🌟',
        '💫',
        '⚡',
        '☀️',
        '🌤️',
        '⛅',
    ],
}

interface CustomEmoji {
    id: string
    name: string
    animated: boolean
}

function EmojiPicker({ value, onChange, guildId }: EmojiPickerProps) {
    const [open, setOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<'emoji' | 'server'>('emoji')
    const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([])
    const [loadingEmojis, setLoadingEmojis] = useState(false)
    const pickerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (activeTab === 'server' && customEmojis.length === 0) {
            loadServerEmojis()
        }
    }, [activeTab])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                pickerRef.current &&
                !pickerRef.current.contains(event.target as Node)
            ) {
                setOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () =>
            document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    async function loadServerEmojis() {
        setLoadingEmojis(true)
        try {
            const response = await fetch(`/api/guilds/${guildId}/emojis`)
            if (!response.ok) throw new Error('Failed to load emojis')
            const data = await response.json()
            setCustomEmojis(data.emojis || [])
        } catch {
            // Failed to load server emojis - silently fail, emoji picker still works
        } finally {
            setLoadingEmojis(false)
        }
    }

    function handleEmojiSelect(emoji: string) {
        onChange(emoji)
        setOpen(false)
    }

    function handleCustomEmojiSelect(emoji: CustomEmoji) {
        const emojiString = emoji.animated
            ? `<a:${emoji.name}:${emoji.id}>`
            : `<:${emoji.name}:${emoji.id}>`
        onChange(emojiString)
        setOpen(false)
    }

    const displayValue = value || ''

    return (
        <div ref={pickerRef} className='relative'>
            <Button
                type='button'
                variant='secondary'
                size='sm'
                className='h-8 w-full justify-start px-2'
                onClick={() => setOpen(!open)}
            >
                {displayValue ? (
                    <>
                        <span className='text-base leading-none'>
                            {displayValue}
                        </span>
                        <span className='ml-2 text-xs text-lucky-text-tertiary'>
                            {displayValue}
                        </span>
                    </>
                ) : (
                    <>
                        <Smile className='h-4 w-4' />
                        <span className='ml-2 text-xs'>Pick emoji</span>
                    </>
                )}
            </Button>

            {open && (
                <div className='absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-lucky-border bg-lucky-bg-secondary shadow-lg'>
                    {/* Tabs */}
                    <div className='flex border-b border-lucky-border'>
                        <button
                            type='button'
                            onClick={() => setActiveTab('emoji')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activeTab === 'emoji'
                                    ? 'border-b-2 border-lucky-accent text-lucky-text-primary'
                                    : 'text-lucky-text-secondary hover:text-lucky-text-primary'
                            }`}
                        >
                            Emoji
                        </button>
                        <button
                            type='button'
                            onClick={() => setActiveTab('server')}
                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                activeTab === 'server'
                                    ? 'border-b-2 border-lucky-accent text-lucky-text-primary'
                                    : 'text-lucky-text-secondary hover:text-lucky-text-primary'
                            }`}
                        >
                            Server
                        </button>
                    </div>

                    {/* Content */}
                    <div className='max-h-96 overflow-y-auto'>
                        {activeTab === 'emoji' ? (
                            <div className='space-y-3 p-3'>
                                {Object.entries(EMOJI_CATEGORIES).map(
                                    ([category, emojis]) => (
                                        <div key={category}>
                                            <div className='mb-2 text-xs font-medium text-lucky-text-secondary'>
                                                {category}
                                            </div>
                                            <div className='grid grid-cols-8 gap-1'>
                                                {emojis.map((emoji, idx) => (
                                                    <button
                                                        key={`${category}-${idx}`}
                                                        type='button'
                                                        onClick={() =>
                                                            handleEmojiSelect(
                                                                emoji,
                                                            )
                                                        }
                                                        className='flex items-center justify-center rounded p-2 text-base transition-colors hover:bg-lucky-bg-tertiary'
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className='p-3'>
                                {loadingEmojis ? (
                                    <div className='flex items-center justify-center py-8'>
                                        <Loader2 className='h-5 w-5 animate-spin text-lucky-accent' />
                                    </div>
                                ) : customEmojis.length > 0 ? (
                                    <div className='grid grid-cols-8 gap-2'>
                                        {customEmojis.map((emoji) => (
                                            <button
                                                key={emoji.id}
                                                type='button'
                                                onClick={() =>
                                                    handleCustomEmojiSelect(
                                                        emoji,
                                                    )
                                                }
                                                className='flex items-center justify-center rounded p-1 transition-colors hover:bg-lucky-bg-tertiary'
                                                title={emoji.name}
                                            >
                                                <img
                                                    src={`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`}
                                                    alt={emoji.name}
                                                    className='h-8 w-8'
                                                    onError={(e) => {
                                                        const img =
                                                            e.target as HTMLImageElement
                                                        img.src =
                                                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"%3E%3Ccircle cx="12" cy="12" r="1"/%3E%3Ccircle cx="19" cy="12" r="1"/%3E%3Ccircle cx="5" cy="12" r="1"/%3E%3C/svg%3E'
                                                    }}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className='py-8 text-center text-xs text-lucky-text-tertiary'>
                                        No custom emojis found
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default EmojiPicker
