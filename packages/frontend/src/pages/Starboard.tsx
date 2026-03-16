import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Settings, Trash2, Save, Loader2, Hash } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SectionHeader from '@/components/ui/SectionHeader'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import type { StarboardConfig, StarboardEntry } from '@/services/starboardApi'

function EntryCard({ entry, index }: { entry: StarboardEntry; index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className='p-4 rounded-xl bg-lucky-bg-secondary/60 border border-lucky-border space-y-2'
        >
            <div className='flex items-start justify-between gap-2'>
                <div className='flex items-center gap-2 text-lucky-accent'>
                    <Star size={14} className='fill-current' />
                    <span className='font-bold text-sm'>{entry.starCount}</span>
                </div>
                <div className='flex items-center gap-1.5'>
                    <Badge variant='secondary' className='text-xs font-mono'>
                        {entry.authorId}
                    </Badge>
                </div>
            </div>
            {entry.content && (
                <p className='text-sm text-lucky-text-body line-clamp-3'>{entry.content}</p>
            )}
            <p className='text-xs text-lucky-text-muted'>
                <Hash size={10} className='inline mr-1' />
                {entry.channelId} · {new Date(entry.createdAt).toLocaleDateString()}
            </p>
        </motion.div>
    )
}

function SkeletonCard() {
    return (
        <div className='p-4 rounded-xl bg-lucky-bg-secondary/60 border border-lucky-border space-y-2'>
            <Skeleton className='h-4 w-20 rounded' />
            <Skeleton className='h-3 w-full rounded' />
            <Skeleton className='h-3 w-2/3 rounded' />
        </div>
    )
}

export default function Starboard() {
    const { selectedGuild } = useGuildStore()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [entries, setEntries] = useState<StarboardEntry[]>([])
    const [, setConfig] = useState<StarboardConfig | null>(null)

    // Config form state
    const [channelId, setChannelId] = useState('')
    const [emoji, setEmoji] = useState('⭐')
    const [threshold, setThreshold] = useState('3')
    const [selfStar, setSelfStar] = useState(false)
    const [hasConfig, setHasConfig] = useState(false)

    const fetchData = useCallback(async () => {
        if (!selectedGuild) return
        setLoading(true)
        try {
            const [cfg, topEntries] = await Promise.all([
                api.starboard.getConfig(selectedGuild.id),
                api.starboard.getTopEntries(selectedGuild.id, 20),
            ])
            setEntries(topEntries)
            setHasConfig(cfg !== null)
            if (cfg) {
                setConfig(cfg)
                setChannelId(cfg.channelId ?? '')
                setEmoji(cfg.emoji || '⭐')
                setThreshold(String(cfg.threshold))
                setSelfStar(cfg.selfStar)
            }
        } catch (err) {
            if (err instanceof ApiError && err.status !== 404) {
                toast.error('Failed to load starboard settings')
            }
        } finally {
            setLoading(false)
        }
    }, [selectedGuild])

    useEffect(() => {
        void fetchData()
    }, [fetchData])

    const handleSave = async () => {
        if (!selectedGuild) return
        setSaving(true)
        try {
            const updated = await api.starboard.updateConfig(selectedGuild.id, {
                channelId: channelId.trim() || undefined,
                emoji: emoji.trim() || '⭐',
                threshold: Number(threshold) || 3,
                selfStar,
            })
            setConfig(updated)
            setHasConfig(true)
            toast.success('Starboard settings saved')
        } catch {
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!selectedGuild) return
        try {
            await api.starboard.deleteConfig(selectedGuild.id)
            setConfig(null)
            setHasConfig(false)
            setChannelId('')
            setEmoji('⭐')
            setThreshold('3')
            setSelfStar(false)
            toast.success('Starboard disabled')
        } catch {
            toast.error('Failed to delete starboard config')
        }
    }

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Star className='h-8 w-8' />}
                title='No server selected'
                description='Select a server to view starboard settings'
            />
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                title='Starboard'
                description='Highlight top-starred messages from your community'
            />

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                {/* Top entries */}
                <div className='lg:col-span-2 space-y-3'>
                    <h3 className='text-sm font-semibold text-lucky-text-muted uppercase tracking-wider flex items-center gap-2'>
                        <Star size={14} />
                        Top Starred Messages
                    </h3>
                    {loading ? (
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <SkeletonCard key={i} />
                            ))}
                        </div>
                    ) : entries.length === 0 ? (
                        <EmptyState
                            icon={<Star className='h-8 w-8' />}
                            title='No starred messages yet'
                            description='Configure the starboard below and members can start starring messages'
                        />
                    ) : (
                        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                            <AnimatePresence>
                                {entries.map((entry, i) => (
                                    <EntryCard key={entry.id} entry={entry} index={i} />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* Config panel */}
                <div className='space-y-4'>
                    <Card className='p-4 space-y-4'>
                        <div className='flex items-center justify-between'>
                            <h3 className='text-sm font-semibold text-lucky-text-muted uppercase tracking-wider flex items-center gap-2'>
                                <Settings size={14} />
                                Configuration
                            </h3>
                            {hasConfig && (
                                <Badge variant='secondary' className='text-xs bg-green-500/10 text-green-400 border-green-500/20'>
                                    Active
                                </Badge>
                            )}
                        </div>

                        <div className='space-y-1'>
                            <Label className='text-xs text-lucky-text-muted flex items-center gap-1'>
                                <Hash size={12} /> Starboard channel ID
                            </Label>
                            <Input
                                placeholder='Channel ID'
                                value={channelId}
                                onChange={e => setChannelId(e.target.value)}
                            />
                        </div>

                        <div className='space-y-1'>
                            <Label className='text-xs text-lucky-text-muted'>Star emoji</Label>
                            <Input
                                placeholder='⭐'
                                value={emoji}
                                onChange={e => setEmoji(e.target.value)}
                                maxLength={10}
                            />
                        </div>

                        <div className='space-y-1'>
                            <Label className='text-xs text-lucky-text-muted'>Threshold (reactions)</Label>
                            <Input
                                type='number'
                                min={1}
                                max={100}
                                value={threshold}
                                onChange={e => setThreshold(e.target.value)}
                            />
                        </div>

                        <div className='flex items-center justify-between'>
                            <Label htmlFor='self-star' className='text-sm text-lucky-text-body'>
                                Allow self-star
                            </Label>
                            <Switch
                                id='self-star'
                                checked={selfStar}
                                onCheckedChange={setSelfStar}
                            />
                        </div>

                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className='w-full'
                        >
                            {saving ? (
                                <Loader2 size={14} className='animate-spin' />
                            ) : (
                                <Save size={14} />
                            )}
                            Save
                        </Button>

                        {hasConfig && (
                            <Button
                                variant='destructive'
                                onClick={handleDelete}
                                className='w-full'
                            >
                                <Trash2 size={14} />
                                Disable Starboard
                            </Button>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    )
}
