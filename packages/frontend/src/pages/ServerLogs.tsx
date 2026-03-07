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
        color: 'text-lukbot-text-secondary',
        bg: 'bg-lukbot-bg-tertiary',
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
            className='flex items-start gap-3 px-4 py-3 hover:bg-lukbot-bg-tertiary/30 transition-colors group'
        >
            <div className={cn('p-1.5 rounded-md mt-0.5 shrink-0', config.bg)}>
                <Icon className={cn('w-3.5 h-3.5', config.color)} />
            </div>
            <div className='flex-1 min-w-0'>
                <div className='flex items-baseline gap-2 flex-wrap'>
                    <Badge
                        variant='outline'
                        className={cn(
                            'text-[9px] uppercase font-bold border-0 px-1.5 py-0',
                            config.bg,
                            config.color,
                        )}
                    >
                        {log.level}
                    </Badge>
                    {log.type && (
                        <span className='text-[10px] text-lukbot-text-tertiary font-mono'>
                            {log.type}
                        </span>
                    )}
                </div>
                <p className='text-sm text-lukbot-text-secondary mt-1 wrap-break-word'>
                    {log.message}
                </p>
                {(log.userName || log.channelName) && (
                    <div className='flex items-center gap-3 mt-1.5 text-[11px] text-lukbot-text-tertiary'>
                        {log.userName && (
                            <span>
                                User:{' '}
                                <span className='text-lukbot-text-secondary'>
                                    {log.userName}
                                </span>
                            </span>
                        )}
                        {log.channelName && (
                            <span>
                                Channel:{' '}
                                <span className='text-lukbot-text-secondary'>
                                    #{log.channelName}
                                </span>
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className='flex items-center gap-1.5 shrink-0 text-[11px] text-lukbot-text-tertiary'>
                <Clock className='w-3 h-3' />
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
            const filters: Record<string, string | number | undefined> = {}
            if (levelFilter !== 'all') filters.level = levelFilter
            if (debouncedSearch) filters.search = debouncedSearch
            const res =
                levelFilter !== 'all'
                    ? await api.serverLogs.getByType(
                          selectedGuild.id,
                          levelFilter,
                      )
                    : await api.serverLogs.getRecent(selectedGuild.id)
            setLogs(res.data.logs)
            setTotal(res.data.logs.length)
        } catch {
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
                <ScrollText className='w-16 h-16 text-lukbot-text-tertiary mb-4' />
                <h2 className='text-xl font-semibold text-white mb-2'>
                    No Server Selected
                </h2>
                <p className='text-lukbot-text-secondary text-sm'>
                    Select a server to view logs
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-start justify-between flex-wrap gap-3'>
                <header>
                    <h1 className='text-2xl font-bold text-white'>
                        Server Logs
                    </h1>
                    <p className='text-sm text-lukbot-text-secondary mt-1'>
                        Activity and moderation logs for {selectedGuild.name}
                    </p>
                </header>
                <div className='flex items-center gap-2'>
                    <Button
                        size='sm'
                        variant='ghost'
                        onClick={handleExport}
                        className='gap-1.5 border border-lukbot-border text-lukbot-text-secondary hover:text-white'
                    >
                        <Download className='w-3.5 h-3.5' /> Export
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card className='p-4'>
                <div className='flex flex-col sm:flex-row gap-3'>
                    <div className='relative flex-1'>
                        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lukbot-text-tertiary' />
                        <Input
                            placeholder='Search logs...'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className='pl-9 bg-lukbot-bg-tertiary border-lukbot-border text-white placeholder:text-lukbot-text-tertiary'
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className='absolute right-3 top-1/2 -translate-y-1/2 text-lukbot-text-tertiary hover:text-white'
                            >
                                <X className='w-4 h-4' />
                            </button>
                        )}
                    </div>
                    <div className='flex items-center gap-2'>
                        <Filter className='w-4 h-4 text-lukbot-text-tertiary shrink-0' />
                        <Select
                            value={levelFilter}
                            onValueChange={setLevelFilter}
                        >
                            <SelectTrigger className='w-[150px] bg-lukbot-bg-tertiary border-lukbot-border text-white'>
                                <SelectValue placeholder='All levels' />
                            </SelectTrigger>
                            <SelectContent className='bg-lukbot-bg-secondary border-lukbot-border'>
                                <SelectItem value='all'>All levels</SelectItem>
                                <SelectItem value='info'>Info</SelectItem>
                                <SelectItem value='warn'>Warnings</SelectItem>
                                <SelectItem value='error'>Errors</SelectItem>
                                <SelectItem value='moderation'>
                                    Moderation
                                </SelectItem>
                                <SelectItem value='automod'>
                                    Auto-Mod
                                </SelectItem>
                                <SelectItem value='system'>System</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Card>

            {/* Log Level Summary */}
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2'>
                {(
                    Object.entries(LEVEL_CONFIG) as [
                        LogLevel,
                        (typeof LEVEL_CONFIG)[LogLevel],
                    ][]
                ).map(([level, config]) => {
                    const Icon = config.icon
                    const count = logs.filter((l) => l.level === level).length
                    return (
                        <button
                            key={level}
                            onClick={() =>
                                setLevelFilter(
                                    levelFilter === level ? 'all' : level,
                                )
                            }
                            className={cn(
                                'flex items-center gap-2 p-2.5 rounded-lg border transition-all text-left',
                                levelFilter === level
                                    ? 'border-lukbot-border/80 bg-lukbot-bg-active'
                                    : 'border-lukbot-border/40 bg-lukbot-bg-secondary/50 hover:bg-lukbot-bg-tertiary',
                            )}
                        >
                            <Icon
                                className={cn('w-4 h-4 shrink-0', config.color)}
                            />
                            <div className='min-w-0'>
                                <p className='text-[10px] uppercase font-semibold text-lukbot-text-tertiary tracking-wider'>
                                    {level}
                                </p>
                                <p className='text-sm font-bold text-white'>
                                    {count}
                                </p>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Logs List */}
            <Card className='p-0 overflow-hidden'>
                <div className='divide-y divide-lukbot-border/30'>
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
                            <ScrollText className='w-12 h-12 text-lukbot-text-tertiary mx-auto mb-3' />
                            <p className='text-sm text-lukbot-text-secondary'>
                                No logs found
                            </p>
                            <p className='text-xs text-lukbot-text-tertiary mt-1'>
                                {searchQuery || levelFilter !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Logs will appear here as events occur'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {total > limit && (
                    <div className='flex items-center justify-between px-4 py-3 border-t border-lukbot-border'>
                        <span className='text-xs text-lukbot-text-tertiary'>
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
                            <span className='text-xs text-lukbot-text-secondary px-2'>
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
