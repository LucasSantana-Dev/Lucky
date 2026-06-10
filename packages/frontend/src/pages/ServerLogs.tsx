import { reportError } from '@/lib/sentry'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ScrollText,
    Search,
    Filter,
    X,
    ChevronLeft,
    ChevronRight,
    Info,
    AlertTriangle,
    AlertOctagon,
    Shield,
    ShieldAlert,
    Settings,
    Download,
    Clock,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import Skeleton from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import type { ServerLog, LogLevel } from '@/types'

const LEVEL_CONFIG: Record<
    LogLevel,
    {
        icon: React.ComponentType<{ className?: string }>
        color: string
        bg: string
    }
> = {
    info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    warn: {
        icon: AlertTriangle,
        color: 'text-yellow-400',
        bg: 'bg-yellow-500/10',
    },
    error: { icon: AlertOctagon, color: 'text-red-400', bg: 'bg-red-500/10' },
    moderation: {
        icon: Shield,
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
    },
    automod: {
        icon: ShieldAlert,
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
    },
    system: {
        icon: Settings,
        color: 'text-lucky-text-secondary',
        bg: 'bg-lucky-bg-tertiary',
    },
}

function formatTimestamp(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

function LogEntry({ log, index }: { log: ServerLog; index: number }) {
    const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info
    const Icon = config.icon

    return (
        <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: index * 0.015 }}
            className='flex items-start gap-3 px-4 py-3.5 hover:bg-lucky-bg-tertiary/40 transition-colors group border-b border-lucky-border/20 last:border-b-0'
        >
            <div
                className={cn(
                    'p-2 rounded-md mt-0.5 shrink-0 flex-center',
                    config.bg,
                )}
            >
                <Icon className={cn('w-3.5 h-3.5', config.color)} />
            </div>
            <div className='flex-1 min-w-0'>
                <div className='flex items-baseline gap-2 flex-wrap'>
                    <Badge
                        variant='outline'
                        className={cn(
                            'text-[8px] uppercase font-bold border-0 px-1.5 py-0.5',
                            config.bg,
                            config.color,
                        )}
                    >
                        {log.level}
                    </Badge>
                    {log.type && (
                        <code className='text-[9px] text-lucky-text-tertiary font-mono bg-lucky-bg-tertiary/50 px-1.5 py-0.5 rounded'>
                            {log.type}
                        </code>
                    )}
                </div>
                <p className='text-sm text-lucky-text-secondary mt-1.5 break-words'>
                    {log.message}
                </p>
                {(log.userName || log.channelName) && (
                    <div className='flex items-center gap-3 mt-2 text-[10px] text-lucky-text-tertiary'>
                        {log.userName && (
                            <span>
                                <span className='text-lucky-text-tertiary'>
                                    User:
                                </span>{' '}
                                <span className='text-lucky-text-secondary font-medium'>
                                    {log.userName}
                                </span>
                            </span>
                        )}
                        {log.channelName && (
                            <span>
                                <span className='text-lucky-text-tertiary'>
                                    Channel:
                                </span>{' '}
                                <span className='text-lucky-text-secondary font-medium'>
                                    #{log.channelName}
                                </span>
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className='flex items-center gap-1.5 shrink-0 text-[10px] text-lucky-text-tertiary whitespace-nowrap'>
                <Clock className='w-3 h-3 opacity-70' />
                {formatTimestamp(log.createdAt)}
            </div>
        </motion.div>
    )
}

export default function ServerLogsPage() {
    const { selectedGuild } = useGuildStore()
    const [logs, setLogs] = useState<ServerLog[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [levelFilter, setLevelFilter] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [page, setPage] = useState(1)
    const limit = 25

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    const fetchLogs = useCallback(async () => {
        if (!selectedGuild?.id) return
        setLoading(true)
        try {
            const pageLimit = limit * page
            const res =
                levelFilter !== 'all'
                    ? await api.serverLogs.getByType(
                          selectedGuild.id,
                          levelFilter,
                          pageLimit,
                      )
                    : await api.serverLogs.getRecent(
                          selectedGuild.id,
                          pageLimit,
                      )
            const allLogs = res.data.logs
            setLogs(allLogs.slice((page - 1) * limit, page * limit))
            setTotal(res.data.total)
        } catch (error) {
            reportError('Failed to load logs:', error, {
                component: 'ServerLogs',
                action: 'loadLogs',
            })
            toast.error('Failed to load logs. Please try again.')
            setLogs([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [selectedGuild?.id, levelFilter, debouncedSearch, page])

    useEffect(() => {
        fetchLogs()
    }, [fetchLogs])
    useEffect(() => {
        setPage(1)
    }, [levelFilter, debouncedSearch])

    const totalPages = Math.max(1, Math.ceil(total / limit))

    const handleExport = () => {
        if (!selectedGuild?.id || logs.length === 0) return
        const blob = new Blob([JSON.stringify(logs, null, 2)], {
            type: 'application/json',
        })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedGuild.name}-logs.json`
        a.click()
        window.URL.revokeObjectURL(url)
        toast.success('Logs exported!')
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <ScrollText className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lucky-text-secondary text-sm'>
                    Select a server to view logs
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-start justify-between flex-wrap gap-3'>
                <header>
                    <h1 className='type-h1 text-lucky-text-primary'>
                        Server Logs
                    </h1>
                    <p className='text-sm text-lucky-text-secondary mt-1'>
                        Activity and moderation logs for {selectedGuild.name}
                    </p>
                </header>
                <div className='flex items-center gap-2'>
                    <Button
                        size='sm'
                        variant='ghost'
                        onClick={handleExport}
                        className='gap-1.5 border border-lucky-border text-lucky-text-secondary hover:text-white'
                    >
                        <Download className='w-3.5 h-3.5' /> Export
                    </Button>
                </div>
            </div>

            {/* Filters: Linear-density layout */}
            <Card className='p-4 space-y-3'>
                <div className='flex items-center gap-2 text-xs font-semibold text-lucky-text-tertiary uppercase tracking-wider'>
                    <Filter className='w-4 h-4' />
                    Search & Filter
                </div>
                <div className='flex flex-col sm:flex-row gap-3'>
                    <div className='relative flex-1'>
                        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lucky-text-tertiary' />
                        <Input
                            placeholder='Search logs...'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className='pl-9 bg-lucky-bg-tertiary border-lucky-border text-lucky-text-primary placeholder:text-lucky-text-tertiary'
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className='absolute right-3 top-1/2 -translate-y-1/2 text-lucky-text-tertiary hover:text-white transition-colors'
                            >
                                <X className='w-4 h-4' />
                            </button>
                        )}
                    </div>
                    <Select value={levelFilter} onValueChange={setLevelFilter}>
                        <SelectTrigger className='sm:w-[140px] bg-lucky-bg-tertiary border-lucky-border text-lucky-text-primary'>
                            <SelectValue placeholder='All levels' />
                        </SelectTrigger>
                        <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                            <SelectItem value='all'>All levels</SelectItem>
                            <SelectItem value='info'>Info</SelectItem>
                            <SelectItem value='warn'>Warnings</SelectItem>
                            <SelectItem value='error'>Errors</SelectItem>
                            <SelectItem value='moderation'>
                                Moderation
                            </SelectItem>
                            <SelectItem value='automod'>Auto-Mod</SelectItem>
                            <SelectItem value='system'>System</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </Card>

            {/* Log Level Summary: Asymmetric Linear-style KPI grid */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3'>
                {(
                    Object.entries(LEVEL_CONFIG) as [
                        LogLevel,
                        (typeof LEVEL_CONFIG)[LogLevel],
                    ][]
                ).map(([level, config], idx) => {
                    const Icon = config.icon
                    const count = logs.filter((l) => l.level === level).length
                    const isLead = idx < 3
                    return (
                        <button
                            key={level}
                            onClick={() =>
                                setLevelFilter(
                                    levelFilter === level ? 'all' : level,
                                )
                            }
                            className={cn(
                                'flex flex-col items-start p-3.5 rounded-lg border transition-all text-left',
                                isLead && 'lg:col-span-2',
                                levelFilter === level
                                    ? 'border-lucky-border/80 bg-lucky-bg-active'
                                    : 'border-lucky-border/40 bg-lucky-bg-secondary/50 hover:border-lucky-border/60 hover:bg-lucky-bg-tertiary/50',
                            )}
                        >
                            <div className='flex items-center gap-2 mb-2 w-full'>
                                <Icon
                                    className={cn(
                                        'w-4 h-4 shrink-0',
                                        config.color,
                                    )}
                                />
                                <p className='text-[9px] uppercase font-semibold text-lucky-text-tertiary tracking-wider'>
                                    {level}
                                </p>
                            </div>
                            <p
                                className={cn(
                                    'font-semibold text-lucky-text-primary',
                                    isLead ? 'text-2xl' : 'text-lg',
                                )}
                            >
                                {count}
                            </p>
                        </button>
                    )
                })}
            </div>

            {/* Logs List */}
            <Card className='p-0 overflow-hidden'>
                <div className='divide-y divide-lucky-border/30'>
                    {loading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className='flex items-start gap-3 px-4 py-3'
                            >
                                <Skeleton className='w-7 h-7 rounded-md' />
                                <div className='flex-1 space-y-2'>
                                    <Skeleton className='h-4 w-16' />
                                    <Skeleton className='h-4 w-3/4' />
                                </div>
                                <Skeleton className='h-4 w-24' />
                            </div>
                        ))
                    ) : logs.length > 0 ? (
                        <AnimatePresence mode='wait'>
                            {logs.map((log, i) => (
                                <LogEntry key={log.id} log={log} index={i} />
                            ))}
                        </AnimatePresence>
                    ) : (
                        <div className='py-16 text-center'>
                            <ScrollText className='w-12 h-12 text-lucky-text-tertiary mx-auto mb-3' />
                            <p className='text-sm text-lucky-text-secondary'>
                                No logs found
                            </p>
                            <p className='text-xs text-lucky-text-tertiary mt-1'>
                                {searchQuery || levelFilter !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Logs will appear here as events occur'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {total > limit && (
                    <div className='flex items-center justify-between px-4 py-3 border-t border-lucky-border'>
                        <span className='text-xs text-lucky-text-tertiary'>
                            {(page - 1) * limit + 1}-
                            {Math.min(page * limit, total)} of {total}
                        </span>
                        <div className='flex items-center gap-1'>
                            <Button
                                size='sm'
                                variant='ghost'
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                                className='h-8 w-8 p-0'
                            >
                                <ChevronLeft className='w-4 h-4' />
                            </Button>
                            <span className='text-xs text-lucky-text-secondary px-2'>
                                {page}/{totalPages}
                            </span>
                            <Button
                                size='sm'
                                variant='ghost'
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => p + 1)}
                                className='h-8 w-8 p-0'
                            >
                                <ChevronRight className='w-4 h-4' />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}
