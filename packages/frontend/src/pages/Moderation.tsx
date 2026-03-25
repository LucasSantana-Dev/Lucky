import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Shield,
    Search,
    Filter,
    AlertTriangle,
    Ban,
    Clock,
    ShieldAlert,
    ChevronLeft,
    ChevronRight,
    X,
    Eye,
    Hash,
    User,
    Calendar,
    BarChart3,
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import Skeleton from '@/components/ui/Skeleton'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { ModerationCase, ModerationStats } from '@/types'

const ACTION_STYLES: Record<
    string,
    { bg: string; text: string; border: string; dot: string }
> = {
    warn: {
        bg: 'bg-yellow-500/10',
        text: 'text-yellow-400',
        border: 'border-yellow-500/20',
        dot: 'bg-yellow-400',
    },
    mute: {
        bg: 'bg-orange-500/10',
        text: 'text-orange-400',
        border: 'border-orange-500/20',
        dot: 'bg-orange-400',
    },
    kick: {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/20',
        dot: 'bg-red-400',
    },
    ban: {
        bg: 'bg-red-600/10',
        text: 'text-red-300',
        border: 'border-red-600/20',
        dot: 'bg-red-500',
    },
    unban: {
        bg: 'bg-green-500/10',
        text: 'text-green-400',
        border: 'border-green-500/20',
        dot: 'bg-green-400',
    },
    unmute: {
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
        dot: 'bg-blue-400',
    },
}

const ACTION_ICONS: Record<
    string,
    React.ComponentType<{ className?: string }>
> = {
    warn: AlertTriangle,
    mute: Clock,
    kick: ShieldAlert,
    ban: Ban,
    unban: Shield,
    unmute: Shield,
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return formatDate(dateStr)
}

function StatCard({
    label,
    value,
    icon: Icon,
    tone,
}: {
    label: string
    value: number
    icon: React.ComponentType<{ className?: string }>
    tone: 'blue' | 'green' | 'yellow' | 'red'
}) {
    const toneClass: Record<typeof tone, string> = {
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        green: 'bg-green-500/10 text-green-400 border-green-500/20',
        yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        red: 'bg-red-500/10 text-red-400 border-red-500/20',
    }

    return (
        <Card className='p-4'>
            <div className='flex items-start justify-between gap-3'>
                <div>
                    <p className='type-meta text-lucky-text-tertiary'>
                        {label}
                    </p>
                    <p className='type-h2 text-lucky-text-primary mt-1'>
                        {value.toLocaleString()}
                    </p>
                </div>
                <div className={cn('p-2 rounded-lg border', toneClass[tone])}>
                    <Icon className='w-4 h-4' />
                </div>
            </div>
        </Card>
    )
}

function CaseDetailModal({
    caseData,
    open,
    onClose,
    onDeactivate,
    deactivating,
}: {
    caseData: ModerationCase | null
    open: boolean
    onClose: () => void
    onDeactivate: (caseId: string) => Promise<void>
    deactivating: boolean
}) {
    if (!caseData) return null
    const style = ACTION_STYLES[caseData.type] || ACTION_STYLES.warn
    const ActionIcon = ACTION_ICONS[caseData.type] || Shield

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className='bg-lucky-bg-secondary border-lucky-border max-w-lg'>
                <DialogHeader>
                    <DialogTitle className='flex items-center gap-3 text-lucky-text-primary'>
                        <div className={cn('p-2 rounded-lg', style.bg)}>
                            <ActionIcon className={cn('w-5 h-5', style.text)} />
                        </div>
                        Case #{caseData.caseNumber}
                    </DialogTitle>
                </DialogHeader>
                <div className='space-y-4 mt-2'>
                    <div className='grid grid-cols-2 gap-4'>
                        <div className='space-y-1'>
                            <p className='type-meta text-lucky-text-tertiary flex items-center gap-1.5'>
                                <User className='w-3 h-3' /> User
                            </p>
                            <p className='type-body-sm font-medium text-lucky-text-primary'>
                                {caseData.userName || caseData.userId}
                            </p>
                        </div>
                        <div className='space-y-1'>
                            <p className='type-meta text-lucky-text-tertiary flex items-center gap-1.5'>
                                <Shield className='w-3 h-3' /> Moderator
                            </p>
                            <p className='type-body-sm font-medium text-lucky-text-primary'>
                                {caseData.moderatorName || caseData.moderatorId}
                            </p>
                        </div>
                        <div className='space-y-1'>
                            <p className='type-meta text-lucky-text-tertiary flex items-center gap-1.5'>
                                <Hash className='w-3 h-3' /> Action
                            </p>
                            <Badge
                                variant='outline'
                                className={cn(
                                    'type-meta uppercase font-semibold border',
                                    style.bg,
                                    style.text,
                                    style.border,
                                )}
                            >
                                {caseData.type}
                            </Badge>
                        </div>
                        <div className='space-y-1'>
                            <p className='type-meta text-lucky-text-tertiary flex items-center gap-1.5'>
                                <Calendar className='w-3 h-3' /> Date
                            </p>
                            <p className='type-body-sm text-lucky-text-secondary'>
                                {formatDate(caseData.createdAt)}
                            </p>
                        </div>
                    </div>
                    <div className='p-3 rounded-lg bg-lucky-bg-tertiary border border-lucky-border'>
                        <p className='type-meta text-lucky-text-tertiary mb-1'>
                            Reason
                        </p>
                        <p className='type-body-sm text-lucky-text-secondary'>
                            {caseData.reason || 'No reason provided'}
                        </p>
                    </div>
                    {caseData.duration && (
                        <div className='flex items-center gap-2'>
                            <Clock className='w-4 h-4 text-lucky-text-tertiary' />
                            <span className='type-body-sm text-lucky-text-secondary'>
                                Duration: {Math.floor(caseData.duration / 60)}{' '}
                                minutes
                            </span>
                        </div>
                    )}
                    <div className='flex items-center gap-3'>
                        <div
                            className={cn(
                                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
                                caseData.active
                                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                    : 'bg-lucky-bg-tertiary text-lucky-text-tertiary border-lucky-border',
                            )}
                        >
                            <div
                                className={cn(
                                    'w-1.5 h-1.5 rounded-full',
                                    caseData.active
                                        ? 'bg-green-400'
                                        : 'bg-lucky-text-disabled',
                                )}
                            />
                            {caseData.active ? 'Active' : 'Expired'}
                        </div>
                        {caseData.appealed && (
                            <div className='flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'>
                                Appealed
                            </div>
                        )}
                    </div>
                    <div className='flex justify-end gap-2 pt-2 border-t border-lucky-border'>
                        <Button
                            size='sm'
                            variant='ghost'
                            onClick={onClose}
                            disabled={deactivating}
                        >
                            Close
                        </Button>
                        {caseData.active && (
                            <Button
                                size='sm'
                                variant='destructive'
                                onClick={() => onDeactivate(caseData.id)}
                                disabled={deactivating}
                            >
                                {deactivating
                                    ? 'Deactivating...'
                                    : 'Deactivate Case'}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default function ModerationPage() {
    const { selectedGuild } = useGuildStore()
    const [cases, setCases] = useState<ModerationCase[]>([])
    const [total, setTotal] = useState(0)
    const [stats, setStats] = useState<ModerationStats | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)
    const [deactivatingCaseId, setDeactivatingCaseId] = useState<string | null>(
        null,
    )
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [selectedCase, setSelectedCase] = useState<ModerationCase | null>(
        null,
    )
    const limit = 15

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    const fetchCases = useCallback(async () => {
        if (!selectedGuild?.id) return
        setLoading(true)
        try {
            const res = await api.moderation.getCases(selectedGuild.id, {
                page,
                limit,
                type:
                    typeFilter !== 'all'
                        ? (typeFilter as ModerationCase['type'])
                        : undefined,
                search: debouncedSearch || undefined,
            })
            setCases(res.data.cases)
            setTotal(res.data.total)
        } catch {
            setCases([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [selectedGuild?.id, page, typeFilter, debouncedSearch])

    const fetchStats = useCallback(async () => {
        if (!selectedGuild?.id) return

        setStatsLoading(true)
        try {
            const res = await api.moderation.getStats(selectedGuild.id)
            setStats(res.data.stats)
        } catch {
            setStats(null)
        } finally {
            setStatsLoading(false)
        }
    }, [selectedGuild?.id])

    const handleDeactivateCase = useCallback(
        async (caseId: string) => {
            if (!selectedGuild?.id) return

            setDeactivatingCaseId(caseId)
            try {
                await api.moderation.deactivateCase(selectedGuild.id, caseId)
                toast.success('Case deactivated')
                await Promise.all([fetchCases(), fetchStats()])
                setSelectedCase((prev) =>
                    prev ? { ...prev, active: false } : prev,
                )
            } catch {
                toast.error('Failed to deactivate case')
            } finally {
                setDeactivatingCaseId(null)
            }
        },
        [selectedGuild?.id, fetchCases, fetchStats],
    )

    useEffect(() => {
        fetchCases()
    }, [fetchCases])

    useEffect(() => {
        fetchStats()
    }, [fetchStats])

    useEffect(() => {
        setPage(1)
    }, [typeFilter, debouncedSearch])

    const totalPages = Math.max(1, Math.ceil(total / limit))

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Shield className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    No Server Selected
                </h2>
                <p className='type-body text-lucky-text-secondary'>
                    Select a server to view moderation cases
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <header>
                <h1 className='type-h1 text-lucky-text-primary'>
                    Moderation Cases
                </h1>
                <p className='type-body text-lucky-text-secondary mt-1'>
                    Manage warnings, mutes, kicks, and bans
                </p>
            </header>

            {statsLoading ? (
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Card key={index} className='p-4'>
                            <Skeleton className='h-3 w-20' />
                            <Skeleton className='h-8 w-16 mt-2' />
                        </Card>
                    ))}
                </div>
            ) : stats ? (
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
                    <StatCard
                        label='Total Cases'
                        value={stats.totalCases}
                        icon={BarChart3}
                        tone='blue'
                    />
                    <StatCard
                        label='Active Cases'
                        value={stats.activeCases}
                        icon={Shield}
                        tone='green'
                    />
                    <StatCard
                        label='Warnings'
                        value={stats.casesByType.warn ?? 0}
                        icon={AlertTriangle}
                        tone='yellow'
                    />
                    <StatCard
                        label='Bans'
                        value={stats.casesByType.ban ?? 0}
                        icon={Ban}
                        tone='red'
                    />
                </div>
            ) : null}

            {/* Filters */}
            <Card className='p-4'>
                <div className='flex flex-col sm:flex-row gap-3'>
                    <div className='relative flex-1'>
                        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lucky-text-tertiary' />
                        <Input
                            placeholder='Search by user, moderator, or reason...'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className='pl-9 bg-lucky-bg-tertiary border-lucky-border text-white placeholder:text-lucky-text-tertiary'
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
                    <div className='flex items-center gap-2'>
                        <Filter className='w-4 h-4 text-lucky-text-tertiary shrink-0' />
                        <Select
                            value={typeFilter}
                            onValueChange={setTypeFilter}
                        >
                            <SelectTrigger className='w-[140px] bg-lucky-bg-tertiary border-lucky-border text-white'>
                                <SelectValue placeholder='All types' />
                            </SelectTrigger>
                            <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                <SelectItem value='all'>All types</SelectItem>
                                <SelectItem value='warn'>Warnings</SelectItem>
                                <SelectItem value='mute'>Mutes</SelectItem>
                                <SelectItem value='kick'>Kicks</SelectItem>
                                <SelectItem value='ban'>Bans</SelectItem>
                                <SelectItem value='unban'>Unbans</SelectItem>
                                <SelectItem value='unmute'>Unmutes</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Card>

            {/* Cases Table */}
            <Card className='overflow-hidden p-0'>
                {/* Header */}
                <div className='hidden md:grid grid-cols-[60px_1fr_1fr_100px_100px_140px_48px] gap-4 px-5 py-3 border-b border-lucky-border bg-lucky-bg-tertiary/30'>
                    {[
                        '#',
                        'User',
                        'Moderator',
                        'Type',
                        'Status',
                        'Date',
                        '',
                    ].map((h) => (
                        <span
                            key={h}
                            className='type-meta text-lucky-text-tertiary'
                        >
                            {h}
                        </span>
                    ))}
                </div>

                {/* Rows */}
                <div className='divide-y divide-lucky-border/40'>
                    {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <div
                                key={i}
                                className='flex items-center gap-4 px-5 py-3.5'
                            >
                                <Skeleton className='w-10 h-4' />
                                <Skeleton className='w-8 h-8 rounded-full' />
                                <div className='flex-1 space-y-1'>
                                    <Skeleton className='h-4 w-28' />
                                    <Skeleton className='h-3 w-20' />
                                </div>
                                <Skeleton className='h-5 w-16 rounded-full' />
                                <Skeleton className='h-4 w-20' />
                            </div>
                        ))
                    ) : cases.length > 0 ? (
                        <AnimatePresence mode='wait'>
                            {cases.map((c, i) => {
                                const style =
                                    ACTION_STYLES[c.type] || ACTION_STYLES.warn
                                const ActionIcon =
                                    ACTION_ICONS[c.type] || Shield
                                return (
                                    <motion.div
                                        key={c.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{
                                            duration: 0.15,
                                            delay: i * 0.02,
                                        }}
                                        className='grid grid-cols-1 md:grid-cols-[60px_1fr_1fr_100px_100px_140px_48px] gap-2 md:gap-4 px-5 py-3.5 hover:bg-lucky-bg-tertiary/30 transition-colors cursor-pointer group'
                                        onClick={() => setSelectedCase(c)}
                                    >
                                        <div className='flex items-center'>
                                            <span className='type-meta font-mono text-lucky-text-tertiary normal-case tracking-normal'>
                                                #{c.caseNumber}
                                            </span>
                                        </div>
                                        <div className='flex items-center gap-2.5 min-w-0'>
                                            <div className='w-7 h-7 rounded-full bg-lucky-bg-active flex items-center justify-center shrink-0'>
                                                <span className='type-meta font-medium text-lucky-text-secondary normal-case tracking-normal'>
                                                    {(c.userName || c.userId)
                                                        .substring(0, 2)
                                                        .toUpperCase()}
                                                </span>
                                            </div>
                                            <span className='type-body-sm text-lucky-text-primary truncate'>
                                                {c.userName || c.userId}
                                            </span>
                                        </div>
                                        <div className='flex items-center min-w-0'>
                                            <span className='type-body-sm text-lucky-text-secondary truncate'>
                                                {c.moderatorName ||
                                                    c.moderatorId}
                                            </span>
                                        </div>
                                        <div className='flex items-center'>
                                            <Badge
                                                variant='outline'
                                                className={cn(
                                                    'text-[10px] uppercase font-semibold gap-1 border',
                                                    style.bg,
                                                    style.text,
                                                    style.border,
                                                )}
                                            >
                                                <ActionIcon className='w-3 h-3' />
                                                {c.type}
                                            </Badge>
                                        </div>
                                        <div className='flex items-center'>
                                            <div
                                                className={cn(
                                                    'type-body-sm flex items-center gap-1.5',
                                                    c.active
                                                        ? 'text-green-400'
                                                        : 'text-lucky-text-tertiary',
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        'w-1.5 h-1.5 rounded-full shrink-0',
                                                        c.active
                                                            ? 'bg-green-400'
                                                            : 'bg-lucky-text-disabled',
                                                    )}
                                                />
                                                {c.active
                                                    ? 'Active'
                                                    : 'Expired'}
                                            </div>
                                        </div>
                                        <div className='flex items-center'>
                                            <span className='type-body-sm text-lucky-text-tertiary'>
                                                {timeAgo(c.createdAt)}
                                            </span>
                                        </div>
                                        <div className='flex items-center justify-center'>
                                            <Eye className='w-4 h-4 text-lucky-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity' />
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    ) : (
                        <div className='py-16 text-center'>
                            <Shield className='w-12 h-12 text-lucky-text-tertiary mx-auto mb-3' />
                            <p className='type-body text-lucky-text-secondary'>
                                No cases found
                            </p>
                            <p className='type-body-sm text-lucky-text-tertiary mt-1'>
                                {searchQuery || typeFilter !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Moderation cases will appear here'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {total > limit && (
                    <div className='flex items-center justify-between px-5 py-3 border-t border-lucky-border'>
                        <span className='type-body-sm text-lucky-text-tertiary'>
                            Showing {(page - 1) * limit + 1}–
                            {Math.min(page * limit, total)} of {total}
                        </span>
                        <div className='flex items-center gap-1'>
                            <Button
                                size='sm'
                                variant='ghost'
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                                className='h-8 w-8 p-0 text-lucky-text-secondary hover:text-lucky-text-primary'
                            >
                                <ChevronLeft className='w-4 h-4' />
                            </Button>
                            <span className='type-body-sm text-lucky-text-secondary px-2'>
                                {page} / {totalPages}
                            </span>
                            <Button
                                size='sm'
                                variant='ghost'
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => p + 1)}
                                className='h-8 w-8 p-0 text-lucky-text-secondary hover:text-lucky-text-primary'
                            >
                                <ChevronRight className='w-4 h-4' />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Case Detail Modal */}
            <CaseDetailModal
                caseData={selectedCase}
                open={!!selectedCase}
                onClose={() => setSelectedCase(null)}
                onDeactivate={handleDeactivateCase}
                deactivating={
                    !!selectedCase && deactivatingCaseId === selectedCase.id
                }
            />
        </div>
    )
}
