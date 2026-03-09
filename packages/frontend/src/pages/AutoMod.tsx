import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    ShieldAlert,
    MessageSquare,
    Type,
    Link2,
    Mail,
    Ban,
    Save,
    Plus,
    X,
    Loader2,
    CheckCircle2,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import Skeleton from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import type { AutoModSettings } from '@/types'

interface FilterCardProps {
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    enabled: boolean
    onToggle: (enabled: boolean) => void
    accent: string
    children?: React.ReactNode
}

function FilterCard({
    title,
    description,
    icon: Icon,
    enabled,
    onToggle,
    accent,
    children,
}: FilterCardProps) {
    return (
        <Card
            className={cn(
                'p-0 overflow-hidden transition-all',
                enabled
                    ? 'border-lucky-border/80 ring-1 ring-lucky-border/30'
                    : 'opacity-80',
            )}
        >
            <div className='flex items-center justify-between p-4 pb-3'>
                <div className='flex items-center gap-3'>
                    <div className={cn('p-2 rounded-lg', accent)}>
                        <Icon className='w-4 h-4 text-white' />
                    </div>
                    <div>
                        <h3 className='text-sm font-semibold text-white'>
                            {title}
                        </h3>
                        <p className='text-xs text-lucky-text-tertiary mt-0.5'>
                            {description}
                        </p>
                    </div>
                </div>
                <Switch checked={enabled} onCheckedChange={onToggle} />
            </div>
            {enabled && children && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className='border-t border-lucky-border'
                >
                    <div className='p-4 pt-3 space-y-3'>{children}</div>
                </motion.div>
            )}
        </Card>
    )
}

function NumberInput({
    value,
    onChange,
    label,
    min,
    max,
}: {
    value: number
    onChange: (v: number) => void
    label: string
    min?: number
    max?: number
}) {
    return (
        <div className='space-y-1.5'>
            <Label className='text-xs text-lucky-text-secondary'>{label}</Label>
            <Input
                type='number'
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                min={min}
                max={max}
                className='h-9 bg-lucky-bg-tertiary border-lucky-border text-white text-sm'
            />
        </div>
    )
}

function TagList({
    items,
    onAdd,
    onRemove,
    placeholder,
}: {
    items: string[]
    onAdd: (item: string) => void
    onRemove: (item: string) => void
    placeholder: string
}) {
    const [input, setInput] = useState('')

    const handleAdd = () => {
        const trimmed = input.trim()
        if (trimmed && !items.includes(trimmed)) {
            onAdd(trimmed)
            setInput('')
        }
    }

    return (
        <div className='space-y-2'>
            <div className='flex gap-2'>
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) =>
                        e.key === 'Enter' && (e.preventDefault(), handleAdd())
                    }
                    placeholder={placeholder}
                    className='h-9 bg-lucky-bg-tertiary border-lucky-border text-white text-sm flex-1'
                />
                <Button
                    size='sm'
                    onClick={handleAdd}
                    className='h-9 px-3 bg-lucky-bg-active hover:bg-lucky-bg-active/80'
                >
                    <Plus className='w-4 h-4' />
                </Button>
            </div>
            {items.length > 0 && (
                <div className='flex flex-wrap gap-1.5'>
                    {items.map((item) => (
                        <Badge
                            key={item}
                            variant='outline'
                            className='bg-lucky-bg-tertiary border-lucky-border text-lucky-text-secondary text-xs gap-1 pr-1'
                        >
                            {item}
                            <button
                                onClick={() => onRemove(item)}
                                className='hover:text-lucky-error transition-colors p-0.5'
                            >
                                <X className='w-3 h-3' />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    )
}

const DEFAULT_SETTINGS: AutoModSettings = {
    id: '',
    guildId: '',
    enabled: true,
    spamEnabled: false,
    spamThreshold: 5,
    spamTimeWindow: 5,
    capsEnabled: false,
    capsThreshold: 70,
    linksEnabled: false,
    allowedDomains: [],
    invitesEnabled: false,
    wordsEnabled: false,
    bannedWords: [],
    exemptChannels: [],
    exemptRoles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

export default function AutoModPage() {
    const { selectedGuild } = useGuildStore()
    const [settings, setSettings] = useState<AutoModSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!selectedGuild?.id) return
        setLoading(true)
        api.automod
            .getSettings(selectedGuild.id)
            .then((res) => setSettings(res.data.settings))
            .catch(() =>
                setSettings({ ...DEFAULT_SETTINGS, guildId: selectedGuild.id }),
            )
            .finally(() => setLoading(false))
    }, [selectedGuild?.id])

    const update = <K extends keyof AutoModSettings>(
        key: K,
        value: AutoModSettings[K],
    ) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }

    const handleSave = async () => {
        if (!selectedGuild?.id) return
        setSaving(true)
        try {
            await api.automod.updateSettings(selectedGuild.id, settings)
            toast.success('Auto-moderation settings saved!')
        } catch {
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <ShieldAlert className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='text-xl font-semibold text-white mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lucky-text-secondary text-sm'>
                    Select a server to configure auto-moderation
                </p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className='space-y-6'>
                <div>
                    <Skeleton className='h-8 w-48 mb-2' />
                    <Skeleton className='h-4 w-72' />
                </div>
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className='p-5'>
                        <Skeleton className='h-12 w-full' />
                    </Card>
                ))}
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-start justify-between'>
                <header>
                    <h1 className='text-2xl font-bold text-white'>
                        Auto-Moderation
                    </h1>
                    <p className='text-sm text-lucky-text-secondary mt-1'>
                        Configure automatic content filters for{' '}
                        {selectedGuild.name}
                    </p>
                </header>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className='bg-lucky-red hover:bg-lucky-red/90 gap-2'
                >
                    {saving ? (
                        <Loader2 className='w-4 h-4 animate-spin' />
                    ) : (
                        <Save className='w-4 h-4' />
                    )}
                    Save Changes
                </Button>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                {/* Spam Detection */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0 }}
                >
                    <FilterCard
                        title='Spam Detection'
                        description='Detect and act on message spam'
                        icon={MessageSquare}
                        enabled={settings.spamEnabled}
                        onToggle={(v) => update('spamEnabled', v)}
                        accent='bg-orange-500/20'
                    >
                        <div className='grid grid-cols-2 gap-3'>
                            <NumberInput
                                label='Max messages'
                                value={settings.spamThreshold}
                                onChange={(v) => update('spamThreshold', v)}
                                min={2}
                                max={20}
                            />
                            <NumberInput
                                label='Time window (s)'
                                value={settings.spamTimeWindow}
                                onChange={(v) => update('spamTimeWindow', v)}
                                min={1}
                                max={60}
                            />
                        </div>
                    </FilterCard>
                </motion.div>

                {/* Caps Detection */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                >
                    <FilterCard
                        title='Caps Lock Detection'
                        description='Detect excessive use of capital letters'
                        icon={Type}
                        enabled={settings.capsEnabled}
                        onToggle={(v) => update('capsEnabled', v)}
                        accent='bg-yellow-500/20'
                    >
                        <NumberInput
                            label='Caps threshold (%)'
                            value={settings.capsThreshold}
                            onChange={(v) => update('capsThreshold', v)}
                            min={50}
                            max={100}
                        />
                    </FilterCard>
                </motion.div>

                {/* Link Filtering */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <FilterCard
                        title='Link Filtering'
                        description='Block or restrict links in messages'
                        icon={Link2}
                        enabled={settings.linksEnabled}
                        onToggle={(v) => update('linksEnabled', v)}
                        accent='bg-blue-500/20'
                    >
                        <div className='space-y-1.5'>
                            <Label className='text-xs text-lucky-text-secondary'>
                                Allowed domains
                            </Label>
                            <TagList
                                items={settings.allowedDomains}
                                onAdd={(d) =>
                                    update('allowedDomains', [
                                        ...settings.allowedDomains,
                                        d,
                                    ])
                                }
                                onRemove={(d) =>
                                    update(
                                        'allowedDomains',
                                        settings.allowedDomains.filter(
                                            (x) => x !== d,
                                        ),
                                    )
                                }
                                placeholder='e.g. youtube.com'
                            />
                        </div>
                    </FilterCard>
                </motion.div>

                {/* Invite Filtering */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <FilterCard
                        title='Invite Link Filtering'
                        description='Block Discord invite links'
                        icon={Mail}
                        enabled={settings.invitesEnabled}
                        onToggle={(v) => update('invitesEnabled', v)}
                        accent='bg-purple-500/20'
                    />
                </motion.div>

                {/* Banned Words */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <FilterCard
                        title='Banned Words'
                        description='Filter messages containing specific words'
                        icon={Ban}
                        enabled={settings.wordsEnabled}
                        onToggle={(v) => update('wordsEnabled', v)}
                        accent='bg-red-500/20'
                    >
                        <div className='space-y-1.5'>
                            <Label className='text-xs text-lucky-text-secondary'>
                                Banned words
                            </Label>
                            <TagList
                                items={settings.bannedWords}
                                onAdd={(w) =>
                                    update('bannedWords', [
                                        ...settings.bannedWords,
                                        w,
                                    ])
                                }
                                onRemove={(w) =>
                                    update(
                                        'bannedWords',
                                        settings.bannedWords.filter(
                                            (x) => x !== w,
                                        ),
                                    )
                                }
                                placeholder='Add a word to ban...'
                            />
                        </div>
                    </FilterCard>
                </motion.div>
            </div>

            {/* Exempt Channels & Roles */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <Card className='p-5'>
                    <div className='flex items-center gap-2 mb-4'>
                        <CheckCircle2 className='w-5 h-5 text-lucky-success' />
                        <h2 className='text-base font-semibold text-white'>
                            Exemptions
                        </h2>
                    </div>
                    <p className='text-xs text-lucky-text-tertiary mb-4'>
                        Channels and roles that are exempt from auto-moderation
                        filters
                    </p>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='space-y-2'>
                            <Label className='text-xs text-lucky-text-secondary'>
                                Exempt Channels (IDs)
                            </Label>
                            <TagList
                                items={settings.exemptChannels}
                                onAdd={(c) =>
                                    update('exemptChannels', [
                                        ...settings.exemptChannels,
                                        c,
                                    ])
                                }
                                onRemove={(c) =>
                                    update(
                                        'exemptChannels',
                                        settings.exemptChannels.filter(
                                            (x) => x !== c,
                                        ),
                                    )
                                }
                                placeholder='Channel ID...'
                            />
                        </div>
                        <div className='space-y-2'>
                            <Label className='text-xs text-lucky-text-secondary'>
                                Exempt Roles (IDs)
                            </Label>
                            <TagList
                                items={settings.exemptRoles}
                                onAdd={(r) =>
                                    update('exemptRoles', [
                                        ...settings.exemptRoles,
                                        r,
                                    ])
                                }
                                onRemove={(r) =>
                                    update(
                                        'exemptRoles',
                                        settings.exemptRoles.filter(
                                            (x) => x !== r,
                                        ),
                                    )
                                }
                                placeholder='Role ID...'
                            />
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Sticky Save Bar (mobile) */}
            <div className='lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-lucky-bg-primary/95 backdrop-blur-sm border-t border-lucky-border z-30'>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className='w-full bg-lucky-red hover:bg-lucky-red/90 gap-2'
                >
                    {saving ? (
                        <Loader2 className='w-4 h-4 animate-spin' />
                    ) : (
                        <Save className='w-4 h-4' />
                    )}
                    Save Changes
                </Button>
            </div>
        </div>
    )
}
