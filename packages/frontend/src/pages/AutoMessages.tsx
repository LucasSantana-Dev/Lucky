import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    MessageSquare,
    Plus,
    Clock,
    Hash,
    Pencil,
    Trash2,
    Calendar,
    X,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import Skeleton from '@/components/ui/Skeleton'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import type { AutoMessage } from '@/types'
import type { CreateAutoMessageInput, UpdateAutoMessageInput } from '@/services/autoMessagesApi'

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

interface MessageFormProps {
    initial?: AutoMessage
    onSave: (data: CreateAutoMessageInput | UpdateAutoMessageInput) => Promise<void>
    onClose: () => void
}

function MessageForm({ initial, onSave, onClose }: MessageFormProps) {
    const [name, setName] = useState(initial?.name ?? '')
    const [channel, setChannel] = useState(initial?.channel ?? '')
    const [content, setContent] = useState(initial?.content ?? '')
    const [interval, setInterval] = useState(initial?.interval ?? 3600)
    const [isEmbed, setIsEmbed] = useState(initial?.isEmbed ?? false)
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        try {
            await onSave({ name, channel, content, interval, isEmbed })
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm'>
            <Card className='w-full max-w-md p-6 space-y-4'>
                <div className='flex items-center justify-between'>
                    <h2 className='text-base font-semibold text-white'>
                        {initial ? 'Edit Auto Message' : 'New Auto Message'}
                    </h2>
                    <button
                        onClick={onClose}
                        className='p-1.5 rounded-md text-lucky-text-tertiary hover:text-white hover:bg-lucky-bg-active transition-colors'
                    >
                        <X className='w-4 h-4' />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className='space-y-3'>
                    <div>
                        <label className='text-xs text-lucky-text-secondary block mb-1'>Name</label>
                        <input
                            className='w-full rounded-lg border border-lucky-border bg-lucky-bg-tertiary px-3 py-2 text-sm text-white placeholder-lucky-text-tertiary focus:outline-none focus:border-lucky-brand'
                            placeholder='e.g. Daily Reminder'
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className='text-xs text-lucky-text-secondary block mb-1'>Channel ID</label>
                        <input
                            className='w-full rounded-lg border border-lucky-border bg-lucky-bg-tertiary px-3 py-2 text-sm text-white placeholder-lucky-text-tertiary focus:outline-none focus:border-lucky-brand'
                            placeholder='Discord channel ID'
                            value={channel}
                            onChange={e => setChannel(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className='text-xs text-lucky-text-secondary block mb-1'>Content</label>
                        <textarea
                            className='w-full rounded-lg border border-lucky-border bg-lucky-bg-tertiary px-3 py-2 text-sm text-white placeholder-lucky-text-tertiary focus:outline-none focus:border-lucky-brand resize-none'
                            placeholder='Message content...'
                            rows={3}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className='text-xs text-lucky-text-secondary block mb-1'>
                            Interval (seconds)
                        </label>
                        <input
                            type='number'
                            min={60}
                            className='w-full rounded-lg border border-lucky-border bg-lucky-bg-tertiary px-3 py-2 text-sm text-white placeholder-lucky-text-tertiary focus:outline-none focus:border-lucky-brand'
                            value={interval}
                            onChange={e => setInterval(Number(e.target.value))}
                            required
                        />
                    </div>
                    <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                            type='checkbox'
                            className='rounded'
                            checked={isEmbed}
                            onChange={e => setIsEmbed(e.target.checked)}
                        />
                        <span className='text-sm text-lucky-text-secondary'>Send as embed</span>
                    </label>
                    <div className='flex justify-end gap-2 pt-2'>
                        <Button variant='secondary' type='button' onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant='primary' type='submit' disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    )
}

export default function AutoMessagesPage() {
    const { selectedGuild } = useGuildStore()
    const [messages, setMessages] = useState<AutoMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editing, setEditing] = useState<AutoMessage | null>(null)

    const fetchMessages = useCallback(async () => {
        if (!selectedGuild?.id) return
        setLoading(true)
        try {
            const res = await api.autoMessages.list(selectedGuild.id)
            setMessages(res.data.messages)
        } catch {
            setMessages([])
        } finally {
            setLoading(false)
        }
    }, [selectedGuild?.id])

    useEffect(() => {
        void fetchMessages()
    }, [fetchMessages])

    async function handleSave(data: CreateAutoMessageInput | UpdateAutoMessageInput) {
        if (!selectedGuild?.id) return
        if (editing) {
            await api.autoMessages.update(selectedGuild.id, editing.id, data as UpdateAutoMessageInput)
        } else {
            await api.autoMessages.create(selectedGuild.id, data as CreateAutoMessageInput)
        }
        await fetchMessages()
    }

    async function handleDelete(id: string) {
        if (!selectedGuild?.id) return
        await api.autoMessages.delete(selectedGuild.id, id)
        await fetchMessages()
    }

    function openCreate() {
        setEditing(null)
        setModalOpen(true)
    }

    function openEdit(msg: AutoMessage) {
        setEditing(msg)
        setModalOpen(true)
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <MessageSquare className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='text-xl font-semibold text-white mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lucky-text-secondary text-sm'>
                    Select a server to manage auto messages
                </p>
            </div>
        )
    }

    return (
        <>
            {modalOpen && (
                <MessageForm
                    initial={editing ?? undefined}
                    onSave={handleSave}
                    onClose={() => setModalOpen(false)}
                />
            )}
            <div className='space-y-6'>
                <div className='flex items-start justify-between'>
                    <header>
                        <h1 className='text-2xl font-bold text-white'>
                            Auto Messages
                        </h1>
                        <p className='text-sm text-lucky-text-secondary mt-1'>
                            Schedule automatic messages for {selectedGuild.name}
                        </p>
                    </header>
                    <Button variant='primary' className='gap-2' onClick={openCreate}>
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
                                    <Card className='p-5 hover:border-lucky-border/80 transition-all'>
                                        <div className='flex items-start justify-between mb-3'>
                                            <div className='flex items-center gap-2'>
                                                <div className='p-2 rounded-lg bg-lucky-purple/15'>
                                                    <MessageSquare className='w-4 h-4 text-lucky-purple' />
                                                </div>
                                                <h3 className='text-sm font-semibold text-white'>
                                                    {msg.name}
                                                </h3>
                                            </div>
                                            <div className='flex items-center gap-1'>
                                                <button
                                                    onClick={() => openEdit(msg)}
                                                    className='p-1.5 rounded-md text-lucky-text-tertiary hover:text-white hover:bg-lucky-bg-active transition-colors'
                                                >
                                                    <Pencil className='w-3.5 h-3.5' />
                                                </button>
                                                <button
                                                    onClick={() => void handleDelete(msg.id)}
                                                    className='p-1.5 rounded-md text-lucky-text-tertiary hover:text-lucky-error hover:bg-lucky-error/10 transition-colors'
                                                >
                                                    <Trash2 className='w-3.5 h-3.5' />
                                                </button>
                                            </div>
                                        </div>
                                        <p className='text-xs text-lucky-text-secondary line-clamp-2 mb-3'>
                                            {msg.content}
                                        </p>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <Badge
                                                variant='outline'
                                                className='text-[10px] gap-1 bg-lucky-bg-tertiary border-lucky-border text-lucky-text-secondary'
                                            >
                                                <Hash className='w-3 h-3' />{' '}
                                                {msg.channel}
                                            </Badge>
                                            <Badge
                                                variant='outline'
                                                className='text-[10px] gap-1 bg-lucky-bg-tertiary border-lucky-border text-lucky-text-secondary'
                                            >
                                                <Clock className='w-3 h-3' /> Every{' '}
                                                {formatInterval(msg.interval)}
                                            </Badge>
                                            {msg.isEmbed && (
                                                <Badge
                                                    variant='outline'
                                                    className='text-[10px] bg-lucky-blue/10 text-lucky-blue border-lucky-blue/20'
                                                >
                                                    Embed
                                                </Badge>
                                            )}
                                            <Badge
                                                variant='outline'
                                                className='text-[10px] gap-1 bg-lucky-bg-tertiary border-lucky-border text-lucky-text-tertiary'
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
                        <MessageSquare className='w-12 h-12 text-lucky-text-tertiary mx-auto mb-3' />
                        <p className='text-sm text-lucky-text-secondary'>
                            No auto messages configured
                        </p>
                        <p className='text-xs text-lucky-text-tertiary mt-1 mb-4'>
                            Create scheduled messages that are posted automatically
                        </p>
                        <Button variant='primary' className='gap-2 mx-auto' onClick={openCreate}>
                            <Plus className='w-4 h-4' /> Create Auto Message
                        </Button>
                    </Card>
                )}
            </div>
        </>
    )
}
