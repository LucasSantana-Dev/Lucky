import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Hash, MessageSquare, Sparkles } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import { Badge } from '@/components/ui/badge'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import type { ReactionRoleMessage } from '@/services/reactionRolesApi'

const BUTTON_STYLE_LABELS: Record<string, string> = {
    '1': 'Primary',
    '2': 'Secondary',
    '3': 'Success',
    '4': 'Danger',
    '5': 'Link',
    Primary: 'Primary',
    Secondary: 'Secondary',
    Success: 'Success',
    Danger: 'Danger',
    Link: 'Link',
}

const BUTTON_STYLE_COLORS: Record<string, string> = {
    '1': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    '2': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    '3': 'bg-green-500/15 text-green-400 border-green-500/30',
    '4': 'bg-red-500/15 text-red-400 border-red-500/30',
    '5': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    Primary: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Secondary: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    Success: 'bg-green-500/15 text-green-400 border-green-500/30',
    Danger: 'bg-red-500/15 text-red-400 border-red-500/30',
    Link: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
}

function MappingPill({
    emoji,
    label,
    style,
    roleId,
}: {
    emoji: string | null
    label: string
    style: string
    roleId: string
}) {
    const styleLabel = BUTTON_STYLE_LABELS[style] ?? style
    const styleColor =
        BUTTON_STYLE_COLORS[style] ??
        'bg-purple-500/15 text-purple-400 border-purple-500/30'
    return (
        <div className='flex items-center gap-2 rounded-lg border border-lucky-border bg-lucky-bg-tertiary/50 px-3 py-2'>
            {emoji && (
                <span className='shrink-0 text-base leading-none'>{emoji}</span>
            )}
            <span className='type-body-sm truncate font-medium text-lucky-text-primary'>
                {label}
            </span>
            <span
                className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styleColor}`}
            >
                {styleLabel}
            </span>
            <code className='type-body-sm shrink-0 rounded bg-lucky-bg-active/60 px-1.5 py-0.5 font-mono text-[11px] text-lucky-text-secondary'>
                {roleId}
            </code>
        </div>
    )
}

function MessageCard({ message }: { message: ReactionRoleMessage }) {
    const date = new Date(message.createdAt)
    const dateStr = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })

    return (
        <Card className='space-y-4 p-5'>
            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                        <MessageSquare className='h-4 w-4 shrink-0 text-lucky-accent' />
                        <code className='type-body-sm truncate font-mono text-lucky-text-secondary'>
                            {message.messageId}
                        </code>
                    </div>
                    <div className='mt-1 flex items-center gap-3 text-lucky-text-tertiary'>
                        <span className='flex items-center gap-1'>
                            <Hash className='h-3.5 w-3.5' />
                            <code className='type-body-sm font-mono'>
                                {message.channelId}
                            </code>
                        </span>
                        <span className='type-body-sm'>·</span>
                        <span className='type-body-sm'>{dateStr}</span>
                    </div>
                </div>
                <Badge variant='secondary' className='shrink-0'>
                    {message.mappings.length}{' '}
                    {message.mappings.length === 1 ? 'role' : 'roles'}
                </Badge>
            </div>

            {message.mappings.length > 0 ? (
                <div className='space-y-2'>
                    {message.mappings.map((mapping) => (
                        <MappingPill
                            key={mapping.id}
                            emoji={mapping.emoji}
                            label={mapping.label}
                            style={mapping.style}
                            roleId={mapping.roleId}
                        />
                    ))}
                </div>
            ) : (
                <p className='type-body-sm text-lucky-text-tertiary'>
                    No role mappings found for this message.
                </p>
            )}
        </Card>
    )
}

function SkeletonCard() {
    return (
        <Card className='space-y-4 p-5'>
            <div className='flex items-start justify-between gap-3'>
                <div className='flex-1 space-y-2'>
                    <Skeleton className='h-4 w-48' />
                    <Skeleton className='h-3.5 w-32' />
                </div>
                <Skeleton className='h-6 w-14 shrink-0 rounded-full' />
            </div>
            <div className='space-y-2'>
                <Skeleton className='h-10 w-full rounded-lg' />
                <Skeleton className='h-10 w-full rounded-lg' />
            </div>
        </Card>
    )
}

export default function ReactionRoles() {
    const { selectedGuild } = useGuildStore()
    const [messages, setMessages] = useState<ReactionRoleMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchMessages = useCallback(async () => {
        if (!selectedGuild) return
        setLoading(true)
        setError(null)
        try {
            const data = await api.reactionRoles.list(selectedGuild.id)
            setMessages(data)
        } catch {
            setError('Failed to load reaction role messages.')
        } finally {
            setLoading(false)
        }
    }, [selectedGuild])

    useEffect(() => {
        void fetchMessages()
    }, [fetchMessages])

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Users className='h-10 w-10' />}
                title='No server selected'
                description='Select a server from the sidebar to view reaction roles.'
            />
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                title='Reaction Roles'
                description='View Discord messages that have reaction role buttons configured. Use the /reactionrole command in Discord to create and manage these.'
            />

            {error && (
                <Card className='border-lucky-error/30 bg-lucky-error/5 p-4'>
                    <p className='type-body-sm text-lucky-error'>{error}</p>
                    <Button
                        variant='secondary'
                        size='sm'
                        className='mt-3'
                        onClick={() => void fetchMessages()}
                    >
                        Retry
                    </Button>
                </Card>
            )}

            {loading ? (
                <div className='space-y-4'>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            ) : messages.length === 0 ? (
                <EmptyState
                    icon={<Sparkles className='h-10 w-10' />}
                    title='No reaction role messages'
                    description='Use /reactionrole in Discord to set up button-based role assignment messages. They will appear here once created.'
                />
            ) : (
                <AnimatePresence mode='popLayout'>
                    <div className='space-y-4'>
                        {messages.map((message, i) => (
                            <motion.div
                                key={message.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{
                                    duration: 0.22,
                                    delay: i * 0.04,
                                }}
                            >
                                <MessageCard message={message} />
                            </motion.div>
                        ))}
                    </div>
                </AnimatePresence>
            )}
        </div>
    )
}
