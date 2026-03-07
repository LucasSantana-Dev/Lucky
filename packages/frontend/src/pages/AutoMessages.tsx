import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    MessageSquare,
    Plus,
    Clock,
    Hash,
    Pencil,
    Trash2,
    Calendar,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import Skeleton from '@/components/ui/Skeleton'
import { useGuildStore } from '@/stores/guildStore'
import type { AutoMessage } from '@/types'

function formatInterval(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
}

function formatNextPost(date: Date): string {
    const d = new Date(date)
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default function AutoMessagesPage() {
    const { selectedGuild } = useGuildStore()
    const [messages, setMessages] = useState<AutoMessage[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!selectedGuild?.id) return
        setLoading(true)
        const timer = setTimeout(() => {
            setMessages([])
            setLoading(false)
        }, 500)
        return () => clearTimeout(timer)
    }, [selectedGuild?.id])

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <MessageSquare className='w-16 h-16 text-nexus-text-tertiary mb-4' />
                <h2 className='text-xl font-semibold text-white mb-2'>
                    No Server Selected
                </h2>
                <p className='text-nexus-text-secondary text-sm'>
                    Select a server to manage auto messages
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-start justify-between'>
                <header>
                    <h1 className='text-2xl font-bold text-white'>
                        Auto Messages
                    </h1>
                    <p className='text-sm text-nexus-text-secondary mt-1'>
                        Schedule automatic messages for {selectedGuild.name}
                    </p>
                </header>
                <Button className='bg-nexus-red hover:bg-nexus-red/90 gap-2'>
                    <Plus className='w-4 h-4' /> New Message
                </Button>
            </div>

            {loading ? (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className='p-5 space-y-3'>
                            <Skeleton className='h-5 w-36' />
                            <Skeleton className='h-4 w-full' />
                            <Skeleton className='h-4 w-2/3' />
                            <div className='flex gap-2'>
                                <Skeleton className='h-6 w-16 rounded-full' />
                                <Skeleton className='h-6 w-20 rounded-full' />
                            </div>
                        </Card>
                    ))}
                </div>
            ) : messages.length > 0 ? (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <AnimatePresence mode='popLayout'>
                        {messages.map((msg, i) => (
                            <motion.div
                                key={msg.id}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2, delay: i * 0.03 }}
                            >
                                <Card className='p-5 hover:border-nexus-border/80 transition-all'>
                                    <div className='flex items-start justify-between mb-3'>
                                        <div className='flex items-center gap-2'>
                                            <div className='p-2 rounded-lg bg-nexus-purple/15'>
                                                <MessageSquare className='w-4 h-4 text-nexus-purple' />
                                            </div>
                                            <h3 className='text-sm font-semibold text-white'>
                                                {msg.name}
                                            </h3>
                                        </div>
                                        <div className='flex items-center gap-1'>
                                            <button className='p-1.5 rounded-md text-nexus-text-tertiary hover:text-white hover:bg-nexus-bg-active transition-colors'>
                                                <Pencil className='w-3.5 h-3.5' />
                                            </button>
                                            <button className='p-1.5 rounded-md text-nexus-text-tertiary hover:text-nexus-error hover:bg-nexus-error/10 transition-colors'>
                                                <Trash2 className='w-3.5 h-3.5' />
                                            </button>
                                        </div>
                                    </div>
                                    <p className='text-xs text-nexus-text-secondary line-clamp-2 mb-3'>
                                        {msg.content}
                                    </p>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <Badge
                                            variant='outline'
                                            className='text-[10px] gap-1 bg-nexus-bg-tertiary border-nexus-border text-nexus-text-secondary'
                                        >
                                            <Hash className='w-3 h-3' />{' '}
                                            {msg.channel}
                                        </Badge>
                                        <Badge
                                            variant='outline'
                                            className='text-[10px] gap-1 bg-nexus-bg-tertiary border-nexus-border text-nexus-text-secondary'
                                        >
                                            <Clock className='w-3 h-3' /> Every{' '}
                                            {formatInterval(msg.interval)}
                                        </Badge>
                                        {msg.isEmbed && (
                                            <Badge
                                                variant='outline'
                                                className='text-[10px] bg-nexus-blue/10 text-nexus-blue border-nexus-blue/20'
                                            >
                                                Embed
                                            </Badge>
                                        )}
                                        <Badge
                                            variant='outline'
                                            className='text-[10px] gap-1 bg-nexus-bg-tertiary border-nexus-border text-nexus-text-tertiary'
                                        >
                                            <Calendar className='w-3 h-3' />{' '}
                                            Next: {formatNextPost(msg.nextPost)}
                                        </Badge>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <Card className='py-16 text-center'>
                    <MessageSquare className='w-12 h-12 text-nexus-text-tertiary mx-auto mb-3' />
                    <p className='text-sm text-nexus-text-secondary'>
                        No auto messages configured
                    </p>
                    <p className='text-xs text-nexus-text-tertiary mt-1 mb-4'>
                        Create scheduled messages that are posted automatically
                    </p>
                    <Button className='bg-nexus-red hover:bg-nexus-red/90 gap-2 mx-auto'>
                        <Plus className='w-4 h-4' /> Create Auto Message
                    </Button>
                </Card>
            )}
        </div>
    )
}
