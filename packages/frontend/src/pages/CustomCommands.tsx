import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Search, X, Code } from 'lucide-react'
import Card from '@/components/ui/Card'
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
                <Terminal className='w-16 h-16 text-lucky-text-tertiary mb-4' />
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
            <header>
                <h1 className='type-h1 text-lucky-text-primary'>
                    Custom Commands
                </h1>
                <p className='text-sm text-lucky-text-secondary mt-1'>
                    Manage and configure commands for {selectedGuild.name}
                </p>
            </header>

            {/* Filters */}
            <Card className='p-4'>
                <div className='flex flex-col sm:flex-row gap-3'>
                    <div className='relative flex-1'>
                        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lucky-text-tertiary' />
                        <Input
                            placeholder='Search commands...'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className='pl-9 bg-lucky-bg-tertiary border-lucky-border text-white placeholder:text-lucky-text-tertiary'
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className='absolute right-3 top-1/2 -translate-y-1/2 text-lucky-text-tertiary hover:text-white'
                            >
                                <X className='w-4 h-4' />
                            </button>
                        )}
                    </div>
                </div>

                {/* Category chips */}
                {categories.length > 0 && (
                    <div className='flex flex-wrap gap-1.5 mt-3'>
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                                !selectedCategory
                                    ? 'bg-lucky-red/15 text-lucky-red border-lucky-red/30'
                                    : 'bg-lucky-bg-tertiary text-lucky-text-secondary border-lucky-border hover:text-white',
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
                                    'px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                                    selectedCategory === cat
                                        ? CATEGORY_COLORS[cat] ||
                                              'bg-lucky-bg-active text-white border-lucky-border'
                                        : 'bg-lucky-bg-tertiary text-lucky-text-secondary border-lucky-border hover:text-white',
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
            </Card>

            {/* Commands Grid */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                {loading ? (
                    Array.from({ length: 9 }).map((_, i) => (
                        <Card key={i} className='p-4 space-y-3'>
                            <div className='flex items-center gap-3'>
                                <Skeleton className='w-8 h-8 rounded-lg' />
                                <div className='flex-1'>
                                    <Skeleton className='h-4 w-24 mb-1' />
                                    <Skeleton className='h-3 w-16' />
                                </div>
                                <Skeleton className='w-10 h-5 rounded-full' />
                            </div>
                            <Skeleton className='h-3 w-full' />
                        </Card>
                    ))
                ) : filtered.length > 0 ? (
                    <AnimatePresence mode='popLayout'>
                        {filtered.map((cmd, i) => (
                            <motion.div
                                key={cmd.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.15, delay: i * 0.02 }}
                            >
                                <Card
                                    className={cn(
                                        'p-4 transition-all hover:border-lucky-border/80',
                                        !cmd.enabled && 'opacity-60',
                                    )}
                                >
                                    <div className='flex items-start gap-3'>
                                        <div className='p-2 rounded-lg bg-lucky-bg-active shrink-0'>
                                            <Code className='w-4 h-4 text-lucky-text-secondary' />
                                        </div>
                                        <div className='flex-1 min-w-0'>
                                            <div className='flex items-center gap-2'>
                                                <h3 className='type-body-sm font-semibold text-lucky-text-primary truncate'>
                                                    /{cmd.name}
                                                </h3>
                                                <Badge
                                                    variant='outline'
                                                    className={cn(
                                                        'text-[9px] uppercase border',
                                                        CATEGORY_COLORS[
                                                            cmd.category
                                                        ] ||
                                                            'bg-lucky-bg-tertiary text-lucky-text-secondary border-lucky-border',
                                                    )}
                                                >
                                                    {cmd.category}
                                                </Badge>
                                            </div>
                                            <p className='text-xs text-lucky-text-tertiary mt-1 line-clamp-2'>
                                                {cmd.description}
                                            </p>
                                        </div>
                                        <Switch
                                            checked={cmd.enabled}
                                            onCheckedChange={() =>
                                                handleToggle(cmd)
                                            }
                                        />
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                ) : (
                    <div className='col-span-full py-16 text-center'>
                        <Terminal className='w-12 h-12 text-lucky-text-tertiary mx-auto mb-3' />
                        <p className='text-sm text-lucky-text-secondary'>
                            No commands found
                        </p>
                        <p className='text-xs text-lucky-text-tertiary mt-1'>
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
