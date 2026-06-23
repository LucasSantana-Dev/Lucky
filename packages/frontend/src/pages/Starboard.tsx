import { reportError } from '@/lib/sentry'
import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import Skeleton from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import type { StarboardConfig, StarboardEntry } from '@/services/starboardApi'

function Starboard() {
    const { selectedGuild } = useGuildStore()
    const [loading, setLoading] = useState(true)
    const [entries, setEntries] = useState<StarboardEntry[]>([])
    const [config, setConfig] = useState<StarboardConfig | null>(null)
    const [saving, setSaving] = useState(false)
    const [channelId, setChannelId] = useState('')
    const [emoji, setEmoji] = useState('⭐')
    const [threshold, setThreshold] = useState(3)
    const [selfStar, setSelfStar] = useState(false)

    useEffect(() => {
        if (!selectedGuild) {
            setLoading(false)
            return
        }

        let mounted = true

        const loadData = async () => {
            setLoading(true)
            try {
                const [configData, entriesData] = await Promise.all([
                    api.starboard.getConfig(selectedGuild.id),
                    api.starboard.getTopEntries(selectedGuild.id, 20),
                ])

                if (!mounted) return

                setEntries(entriesData)

                if (configData) {
                    setConfig(configData)
                    setChannelId(configData.channelId)
                    setEmoji(configData.emoji || '⭐')
                    setThreshold(configData.threshold)
                    setSelfStar(configData.selfStar)
                } else {
                    setConfig(null)
                    setChannelId('')
                    setEmoji('⭐')
                    setThreshold(3)
                    setSelfStar(false)
                }
            } catch (error) {
                if (!mounted) return
                if (error instanceof ApiError) {
                    reportError('Failed to load starboard data:', error, {
                        component: 'Starboard',
                        action: 'loadData',
                    })
                    toast.error('Failed to load starboard settings')
                }
            } finally {
                if (mounted) setLoading(false)
            }
        }

        loadData()
        return () => {
            mounted = false
        }
    }, [selectedGuild?.id])

    const handleSave = async () => {
        if (!selectedGuild) return

        const trimmedEmoji = emoji.trim() || '⭐'

        setSaving(true)
        try {
            await api.starboard.updateConfig(selectedGuild.id, {
                channelId,
                emoji: trimmedEmoji,
                threshold: threshold || 3,
                selfStar,
            })
            toast.success('Starboard settings saved')
        } catch (error) {
            reportError('Failed to save starboard settings:', error, {
                component: 'Starboard',
                action: 'saveSettings',
            })
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    const handleDisable = async () => {
        if (!selectedGuild) return

        setSaving(true)
        try {
            await api.starboard.deleteConfig(selectedGuild.id)
            setConfig(null)
            setChannelId('')
            setEmoji('⭐')
            setThreshold(3)
            setSelfStar(false)
            toast.success('Starboard disabled')
        } catch (error) {
            reportError('Failed to disable starboard:', error, {
                component: 'Starboard',
                action: 'disable',
            })
            toast.error('Failed to delete starboard config')
        } finally {
            setSaving(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center py-12'>
                <div className='text-center'>
                    <p className='text-lg font-semibold text-lucky-text-primary mb-2'>
                        No server selected
                    </p>
                    <p className='text-sm text-lucky-text-secondary'>
                        Select a server to view starboard settings
                    </p>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className='space-y-4'>
                <Skeleton className='h-16 rounded' />
                <Skeleton className='h-32 rounded' />
                <Skeleton className='h-32 rounded' />
            </div>
        )
    }

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
        })
    }

    return (
        <div className='space-y-6'>
            {/* Entries */}
            <section>
                <h2 className='type-title text-lucky-text-primary uppercase tracking-wide mb-4'>
                    Top Starred Messages
                </h2>
                {entries.length === 0 ? (
                    <Card className='border border-lucky-border p-8 text-center'>
                        <p className='text-lg font-semibold text-lucky-text-primary mb-2'>
                            No starred messages yet
                        </p>
                        <p className='text-sm text-lucky-text-secondary'>
                            Configure the starboard below and members can start
                            starring messages
                        </p>
                    </Card>
                ) : (
                    <div className='grid grid-cols-1 gap-3'>
                        {entries.map((entry) => (
                            <Card
                                key={entry.id}
                                className='border border-lucky-border p-4'
                            >
                                {entry.content && (
                                    <p className='text-sm text-lucky-text-primary mb-3'>
                                        {entry.content}
                                    </p>
                                )}
                                <div className='flex items-center justify-between pt-2 border-t border-lucky-border text-xs'>
                                    <div className='flex items-center gap-3'>
                                        <span className='font-semibold text-lucky-brand'>
                                            {entry.starCount}
                                        </span>
                                        <span className='text-lucky-text-secondary'>
                                            {formatDate(entry.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </section>

            {/* Settings */}
            <section>
                <h2 className='type-title text-lucky-text-primary uppercase tracking-wide mb-4'>
                    Settings
                </h2>
                <Card className='border border-lucky-border p-6 space-y-4'>
                    {config && (
                        <div className='mb-4'>
                            <Badge className='rounded-sm bg-lucky-success text-lucky-text-primary uppercase font-semibold text-xs'>
                                Active
                            </Badge>
                        </div>
                    )}

                    <div>
                        <Label
                            htmlFor='channel'
                            className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold text-sm'
                        >
                            Channel ID
                        </Label>
                        <Input
                            id='channel'
                            type='text'
                            value={channelId}
                            onChange={(e) => setChannelId(e.target.value)}
                            placeholder='Channel ID'
                            className='mt-1.5'
                        />
                    </div>

                    <div>
                        <Label
                            htmlFor='emoji'
                            className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold text-sm'
                        >
                            Emoji
                        </Label>
                        <Input
                            id='emoji'
                            type='text'
                            value={emoji}
                            onChange={(e) => setEmoji(e.target.value)}
                            placeholder='⭐'
                            className='mt-1.5'
                        />
                    </div>

                    <div>
                        <Label
                            htmlFor='threshold'
                            className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold text-sm'
                        >
                            Star Threshold
                        </Label>
                        <Input
                            id='threshold'
                            type='number'
                            value={threshold}
                            onChange={(e) =>
                                setThreshold(
                                    e.target.value
                                        ? parseInt(e.target.value)
                                        : 3,
                                )
                            }
                            min='1'
                            max='100'
                            className='mt-1.5'
                        />
                    </div>

                    <div className='flex items-center justify-between pt-2 border-t border-lucky-border'>
                        <Label
                            htmlFor='selfStar'
                            className='type-meta text-lucky-text-tertiary uppercase tracking-wide font-semibold text-sm'
                        >
                            Allow Self-Star
                        </Label>
                        <Switch
                            id='selfStar'
                            aria-label='Allow self-star'
                            checked={selfStar}
                            onCheckedChange={setSelfStar}
                        />
                    </div>

                    <div className='flex gap-2 pt-4'>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className='flex-1'
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </Button>
                        {config && (
                            <Button
                                onClick={handleDisable}
                                disabled={saving}
                                variant='secondary'
                            >
                                Disable Starboard
                            </Button>
                        )}
                    </div>
                </Card>
            </section>
        </div>
    )
}

export default Starboard
