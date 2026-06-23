import { useState, useEffect, useMemo } from 'react'
import { Search, X, Code, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import Skeleton from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import type { Command } from '@/types'

const CATEGORY_COLORS: Record<string, string> = {
    Manager: 'bg-red-500/10 text-red-400 border-red-500/20',
    Moderator: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    Fun: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    Info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Misc: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    Roles: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    Tags: 'bg-green-500/10 text-green-400 border-green-500/20',
    Slowmode: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    Game: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Levels: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

export default function CustomCommandsPage() {
    const { selectedGuild } = useGuildStore()
    const [commands, setCommands] = useState<Command[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(
        null,
    )
    const [expandedCommand, setExpandedCommand] = useState<string | null>(null)

    useEffect(() => {
        if (!selectedGuild?.id) return
        setLoading(true)
        api.commands
            .list(selectedGuild.id)
            .then((res) => setCommands(res.data.commands))
            .catch(() => setCommands([]))
            .finally(() => setLoading(false))
    }, [selectedGuild?.id])

    const categories = useMemo(() => {
        return Array.from(new Set(commands.map((c) => c.category)))
    }, [commands])

    const filtered = useMemo(() => {
        return commands.filter((cmd) => {
            const matchesSearch =
                !searchQuery ||
                cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                cmd.description
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())
            const matchesCat =
                !selectedCategory || cmd.category === selectedCategory
            return matchesSearch && matchesCat
        })
    }, [commands, searchQuery, selectedCategory])

    const handleToggle = async (cmd: Command) => {
        try {
            await api.commands.toggle(selectedGuild!.id, cmd.id, !cmd.enabled)
            setCommands((prev) =>
                prev.map((c) =>
                    c.id === cmd.id ? { ...c, enabled: !c.enabled } : c,
                ),
            )
            toast.success(`${cmd.name} ${cmd.enabled ? 'disabled' : 'enabled'}`)
        } catch {
            toast.error('Failed to toggle command')
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Code className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lucky-text-secondary text-sm'>
                    Select a server to manage commands
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            {/* Header */}
            <header>
                <h1 className='type-h1 text-lucky-text-primary'>
                    Custom Commands
                </h1>
                <p className='text-sm text-lucky-text-secondary mt-1'>
                    Manage and configure commands for {selectedGuild.name}
                </p>
            </header>

            {/* Search + Filters */}
            <div className='surface-panel rounded-lg p-4 space-y-3 border border-lucky-border'>
                <div className='relative'>
                    <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lucky-text-tertiary' />
                    <Input
                        placeholder='Search commands...'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='pl-9 bg-lucky-bg-tertiary border-lucky-border text-lucky-text-primary placeholder:text-lucky-text-tertiary'
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className='absolute right-3 top-1/2 -translate-y-1/2 text-lucky-text-tertiary hover:text-lucky-text-primary transition-colors'
                        >
                            <X className='w-4 h-4' />
                        </button>
                    )}
                </div>

                {/* Category chips */}
                {categories.length > 0 && (
                    <div className='flex flex-wrap gap-2'>
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={cn(
                                'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                                !selectedCategory
                                    ? 'bg-lucky-error/10 text-lucky-error border-lucky-error/40'
                                    : 'bg-lucky-bg-active text-lucky-text-secondary border-lucky-border hover:bg-lucky-surface-elevated',
                            )}
                        >
                            All ({commands.length})
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() =>
                                    setSelectedCategory(
                                        selectedCategory === cat ? null : cat,
                                    )
                                }
                                className={cn(
                                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                                    selectedCategory === cat
                                        ? CATEGORY_COLORS[cat] ||
                                              'bg-lucky-error/10 text-lucky-error border-lucky-error/40'
                                        : 'bg-lucky-bg-active text-lucky-text-secondary border-lucky-border hover:bg-lucky-surface-elevated',
                                )}
                            >
                                {cat} (
                                {
                                    commands.filter((c) => c.category === cat)
                                        .length
                                }
                                )
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Commands List */}
            <div className='space-y-1'>
                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div
                            key={i}
                            className='surface-panel rounded-lg p-4 border border-lucky-border flex items-center gap-3'
                        >
                            <Skeleton className='w-8 h-8 rounded' />
                            <div className='flex-1'>
                                <Skeleton className='h-4 w-40 mb-2' />
                                <Skeleton className='h-3 w-60' />
                            </div>
                            <Skeleton className='w-10 h-6 rounded' />
                        </div>
                    ))
                ) : filtered.length > 0 ? (
                    filtered.map((cmd) => (
                        <div
                            key={cmd.id}
                            className={cn(
                                'surface-panel rounded-lg border border-lucky-border transition-all',
                                !cmd.enabled && 'opacity-60',
                            )}
                        >
                            {/* Row header */}
                            <button
                                onClick={() =>
                                    setExpandedCommand(
                                        expandedCommand === cmd.id
                                            ? null
                                            : cmd.id,
                                    )
                                }
                                className='w-full px-4 py-3 flex items-center gap-3 transition-colors hover:bg-lucky-bg-active/25'
                            >
                                <div className='p-2 rounded bg-lucky-bg-active shrink-0'>
                                    <Code className='w-4 h-4 text-lucky-text-secondary' />
                                </div>
                                <div className='flex-1 min-w-0 text-left'>
                                    <div className='flex items-center gap-2 mb-1'>
                                        <h3 className='type-body-sm font-semibold text-lucky-text-primary truncate'>
                                            /{cmd.name}
                                        </h3>
                                        <Badge
                                            className={cn(
                                                'text-[10px] uppercase border shrink-0 font-semibold',
                                                CATEGORY_COLORS[cmd.category] ||
                                                    'bg-lucky-bg-active text-lucky-text-secondary border-lucky-border',
                                            )}
                                        >
                                            {cmd.category}
                                        </Badge>
                                    </div>
                                    <p className='text-xs text-lucky-text-tertiary line-clamp-1'>
                                        {cmd.description}
                                    </p>
                                </div>
                                <div className='flex items-center gap-2 shrink-0'>
                                    <Switch
                                        checked={cmd.enabled}
                                        onCheckedChange={() =>
                                            handleToggle(cmd)
                                        }
                                    />
                                    <ChevronDown
                                        className={cn(
                                            'w-4 h-4 text-lucky-text-tertiary transition-transform',
                                            expandedCommand === cmd.id &&
                                                'rotate-180',
                                        )}
                                    />
                                </div>
                            </button>

                            {/* Expanded details */}
                            {expandedCommand === cmd.id && (
                                <div className='border-t border-lucky-border px-4 py-3 bg-lucky-bg-tertiary/30 text-xs text-lucky-text-secondary space-y-2'>
                                    <div>
                                        <p className='font-medium text-lucky-text-primary mb-1'>
                                            Description
                                        </p>
                                        <p>{cmd.description}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className='surface-panel rounded-lg p-12 border border-lucky-border text-center'>
                        <Code className='w-12 h-12 text-lucky-text-tertiary mx-auto mb-3' />
                        <p className='text-sm text-lucky-text-secondary mb-1'>
                            No commands found
                        </p>
                        <p className='text-xs text-lucky-text-tertiary'>
                            {searchQuery || selectedCategory
                                ? 'Try adjusting your filters'
                                : 'Commands will appear here'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
