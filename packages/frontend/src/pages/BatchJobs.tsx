import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
    Clock,
    Search,
    Filter,
    ChevronLeft,
    ChevronRight,
    X,
    AlertCircle,
    CheckCircle,
    Zap,
    Pause,
    XCircle,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import EmptyState from '@/components/ui/EmptyState'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import Skeleton from '@/components/ui/Skeleton'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { BatchJob, BatchJobStatus, BatchProgress } from '@/types'

const STATUS_STYLES: Record<
    BatchJobStatus,
    {
        bg: string
        text: string
        border: string
        dot: string
        icon: React.ComponentType<{ className?: string }>
    }
> = {
    pending: {
        bg: 'bg-gray-500/10',
        text: 'text-gray-400',
        border: 'border-gray-500/20',
        dot: 'bg-gray-400',
        icon: Clock,
    },
    in_progress: {
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        border: 'border-blue-500/20',
        dot: 'bg-blue-400',
        icon: Zap,
    },
    paused: {
        bg: 'bg-yellow-500/10',
        text: 'text-yellow-400',
        border: 'border-yellow-500/20',
        dot: 'bg-yellow-400',
        icon: Pause,
    },
    completed: {
        bg: 'bg-green-500/10',
        text: 'text-green-400',
        border: 'border-green-500/20',
        dot: 'bg-green-400',
        icon: CheckCircle,
    },
    failed: {
        bg: 'bg-red-500/10',
        text: 'text-red-400',
        border: 'border-red-500/20',
        dot: 'bg-red-400',
        icon: XCircle,
    },
    cancelled: {
        bg: 'bg-orange-500/10',
        text: 'text-orange-400',
        border: 'border-orange-500/20',
        dot: 'bg-orange-400',
        icon: AlertCircle,
    },
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

function JobDetailPanel({
    jobData,
    open,
    onClose,
    onCancel,
    cancelling,
}: {
    jobData: BatchJob | null
    open: boolean
    onClose: () => void
    onCancel: (jobId: string) => Promise<void>
    cancelling: boolean
}) {
    const { t } = useTranslation('batchJobs')
    const [progress, setProgress] = useState<BatchProgress | null>(null)
    const [loadingProgress, setLoadingProgress] = useState(false)
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const { selectedGuild } = useGuildStore()

    useEffect(() => {
        if (!open || !jobData || !selectedGuild) return

        const fetchProgress = async () => {
            setLoadingProgress(true)
            try {
                const res = await api.batchJobs.getProgress(
                    selectedGuild.id,
                    jobData.id,
                )
                setProgress(res.data.progress)
            } catch {
                // silently fail on progress poll
            } finally {
                setLoadingProgress(false)
            }
        }

        // Fetch immediately
        fetchProgress()

        // Poll every 2s if in progress
        if (jobData.status === 'in_progress') {
            pollIntervalRef.current = setInterval(fetchProgress, 2000)
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
            }
        }
    }, [open, jobData, selectedGuild])

    if (!jobData) return null

    const style = STATUS_STYLES[jobData.status] || STATUS_STYLES.pending
    const StatusIcon = style.icon

    const progressPercent =
        jobData.totalItems > 0
            ? Math.round((jobData.processedItems / jobData.totalItems) * 100)
            : 0

    const currentProcessed = progress?.processedItems ?? jobData.processedItems
    const currentTotal = progress?.totalItems ?? jobData.totalItems
    const currentFailed = progress?.failedItems ?? jobData.failedItems
    const currentSkipped = progress?.skippedItems ?? jobData.skippedItems

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className='fixed inset-0 z-40 bg-black/40'
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{
                            type: 'spring',
                            damping: 25,
                            stiffness: 300,
                        }}
                        className='fixed right-0 top-0 h-screen w-96 bg-lucky-bg-secondary border-l border-lucky-border z-50 flex flex-col'
                    >
                        <div className='flex items-center justify-between p-6 border-b border-lucky-border'>
                            <div className='flex items-center gap-3'>
                                <div className={cn('p-2 rounded-lg', style.bg)}>
                                    <StatusIcon
                                        className={cn('w-5 h-5', style.text)}
                                    />
                                </div>
                                <h2 className='type-title text-lucky-text-primary'>
                                    {t('jobDetails')}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className='text-lucky-text-tertiary hover:text-lucky-text-primary transition-colors p-1'
                            >
                                <X className='w-5 h-5' />
                            </button>
                        </div>

                        <div className='flex-1 overflow-y-auto p-6 space-y-4'>
                            <div className='space-y-1'>
                                <p className='type-meta text-lucky-text-tertiary'>
                                    {t('tableHeaderType')}
                                </p>
                                <p className='type-body text-lucky-text-primary'>
                                    {jobData.jobType}
                                </p>
                            </div>

                            <div className='space-y-1'>
                                <p className='type-meta text-lucky-text-tertiary'>
                                    {t('tableHeaderStatus')}
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
                                    {t(jobData.status)}
                                </Badge>
                            </div>

                            <div className='space-y-1'>
                                <p className='type-meta text-lucky-text-tertiary'>
                                    {t('tableHeaderInitiator')}
                                </p>
                                <p className='type-body text-lucky-text-primary'>
                                    {jobData.initiatedBy}
                                </p>
                            </div>

                            <div className='space-y-1'>
                                <p className='type-meta text-lucky-text-tertiary'>
                                    {t('tableHeaderDate')}
                                </p>
                                <p className='type-body-sm text-lucky-text-secondary'>
                                    {formatDate(jobData.createdAt)}
                                </p>
                            </div>

                            {jobData.startedAt && (
                                <div className='space-y-1'>
                                    <p className='type-meta text-lucky-text-tertiary'>
                                        {t('startedAt')}
                                    </p>
                                    <p className='type-body-sm text-lucky-text-secondary'>
                                        {formatDate(jobData.startedAt)}
                                    </p>
                                </div>
                            )}

                            {jobData.completedAt && (
                                <div className='space-y-1'>
                                    <p className='type-meta text-lucky-text-tertiary'>
                                        {t('completedAt')}
                                    </p>
                                    <p className='type-body-sm text-lucky-text-secondary'>
                                        {formatDate(jobData.completedAt)}
                                    </p>
                                </div>
                            )}

                            {jobData.estimatedMinutes && (
                                <div className='space-y-1'>
                                    <p className='type-meta text-lucky-text-tertiary'>
                                        {t('estimatedTime')}
                                    </p>
                                    <p className='type-body-sm text-lucky-text-secondary'>
                                        {t('minutes', {
                                            count: jobData.estimatedMinutes,
                                        })}
                                    </p>
                                </div>
                            )}

                            <div className='space-y-3 pt-2'>
                                <p className='type-meta text-lucky-text-tertiary mb-2'>
                                    {loadingProgress
                                        ? t('liveProgress')
                                        : t('progress')}
                                </p>

                                <div className='space-y-2'>
                                    <div className='relative w-full h-2 bg-lucky-bg-tertiary rounded-full overflow-hidden'>
                                        <div
                                            className='h-full bg-blue-500 transition-all'
                                            style={{
                                                width: `${progressPercent}%`,
                                            }}
                                        />
                                    </div>
                                    <div className='flex justify-between text-xs text-lucky-text-tertiary'>
                                        <span>
                                            {currentProcessed} / {currentTotal}
                                        </span>
                                        <span>{progressPercent}%</span>
                                    </div>
                                </div>
                            </div>

                            <div className='grid grid-cols-4 gap-2 pt-2'>
                                <div className='text-center'>
                                    <p className='text-xs text-lucky-text-tertiary mb-1'>
                                        {t('successItems')}
                                    </p>
                                    <p className='type-body font-semibold text-green-400'>
                                        {currentProcessed -
                                            currentFailed -
                                            currentSkipped}
                                    </p>
                                </div>
                                <div className='text-center'>
                                    <p className='text-xs text-lucky-text-tertiary mb-1'>
                                        {t('failedItems')}
                                    </p>
                                    <p className='type-body font-semibold text-red-400'>
                                        {currentFailed}
                                    </p>
                                </div>
                                <div className='text-center'>
                                    <p className='text-xs text-lucky-text-tertiary mb-1'>
                                        {t('skippedItems')}
                                    </p>
                                    <p className='type-body font-semibold text-yellow-400'>
                                        {currentSkipped}
                                    </p>
                                </div>
                                <div className='text-center'>
                                    <p className='text-xs text-lucky-text-tertiary mb-1'>
                                        {t('totalItems')}
                                    </p>
                                    <p className='type-body font-semibold text-lucky-text-primary'>
                                        {currentTotal}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {(jobData.status === 'pending' ||
                            jobData.status === 'in_progress') && (
                            <div className='border-t border-lucky-border p-4'>
                                <Button
                                    onClick={() => onCancel(jobData.id)}
                                    disabled={cancelling}
                                    variant='destructive'
                                    className='w-full'
                                >
                                    {cancelling
                                        ? t('cancelling')
                                        : t('cancelJob')}
                                </Button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

export default function BatchJobsPage() {
    const { t } = useTranslation('batchJobs')
    const prefersReducedMotion = useReducedMotion()
    const { selectedGuild } = useGuildStore()
    const [jobs, setJobs] = useState<BatchJob[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [cancelllingJobId, setCancellingJobId] = useState<string | null>(null)
    const [selectedJob, setSelectedJob] = useState<BatchJob | null>(null)
    const limit = 15

    const fetchJobs = useCallback(async () => {
        if (!selectedGuild?.id) return
        setLoading(true)
        try {
            const res = await api.batchJobs.list(selectedGuild.id, {
                status:
                    statusFilter !== 'all'
                        ? (statusFilter as BatchJobStatus)
                        : undefined,
                limit,
                offset: (page - 1) * limit,
            })
            setJobs(res.data.jobs)
            setTotal(res.data.jobs.length)
        } catch {
            setJobs([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [selectedGuild?.id, page, statusFilter])

    const handleCancelJob = useCallback(
        async (jobId: string) => {
            if (!selectedGuild?.id) return

            setCancellingJobId(jobId)
            try {
                await api.batchJobs.cancel(selectedGuild.id, jobId)
                toast.success(t('jobCancelled'))
                await fetchJobs()
                setSelectedJob((prev) =>
                    prev && prev.id === jobId
                        ? { ...prev, status: 'cancelled' }
                        : prev,
                )
            } catch {
                toast.error(t('failedToCancelJob'))
            } finally {
                setCancellingJobId(null)
            }
        },
        [selectedGuild?.id, fetchJobs, t],
    )

    useEffect(() => {
        fetchJobs()
    }, [fetchJobs])

    useEffect(() => {
        setPage(1)
    }, [statusFilter])

    const totalPages = Math.max(1, Math.ceil(total / limit))

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <Clock className='w-16 h-16 text-lucky-text-tertiary mb-4' />
                <h2 className='type-h2 text-lucky-text-primary mb-2'>
                    {t('noServerSelected')}
                </h2>
                <p className='type-body text-lucky-text-secondary'>
                    {t('selectServerToViewJobs')}
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <header>
                <h1 className='type-h1 text-lucky-text-primary'>
                    {t('batchJobs')}
                </h1>
                <p className='type-body text-lucky-text-secondary mt-1'>
                    {t('manageOperations')}
                </p>
            </header>

            {/* Filters */}
            <Card className='p-4 border border-lucky-border'>
                <div className='flex flex-col sm:flex-row gap-3'>
                    <div className='relative flex-1'>
                        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-lucky-text-tertiary' />
                        <Input
                            placeholder={t('searchByTypeOrInitiator')}
                            disabled
                            className='pl-9 bg-lucky-bg-tertiary border-lucky-border text-white placeholder:text-lucky-text-tertiary'
                        />
                    </div>
                    <div className='flex items-center gap-2'>
                        <Filter className='w-4 h-4 text-lucky-text-tertiary shrink-0' />
                        <Select
                            value={statusFilter}
                            onValueChange={setStatusFilter}
                        >
                            <SelectTrigger className='w-[140px] bg-lucky-bg-tertiary border-lucky-border text-white'>
                                <SelectValue placeholder={t('allStatuses')} />
                            </SelectTrigger>
                            <SelectContent className='bg-lucky-bg-secondary border-lucky-border'>
                                <SelectItem value='all'>
                                    {t('allStatuses')}
                                </SelectItem>
                                <SelectItem value='pending'>
                                    {t('pending')}
                                </SelectItem>
                                <SelectItem value='in_progress'>
                                    {t('in_progress')}
                                </SelectItem>
                                <SelectItem value='paused'>
                                    {t('paused')}
                                </SelectItem>
                                <SelectItem value='completed'>
                                    {t('completed')}
                                </SelectItem>
                                <SelectItem value='failed'>
                                    {t('failed')}
                                </SelectItem>
                                <SelectItem value='cancelled'>
                                    {t('cancelled')}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Card>

            {/* Jobs Table */}
            <Card className='overflow-hidden p-0 border border-lucky-border'>
                {/* Header */}
                <div className='hidden md:grid grid-cols-[1fr_100px_80px_100px_80px] gap-4 px-6 py-3 border-b border-lucky-border bg-lucky-bg-tertiary/20'>
                    {[
                        t('tableHeaderJob'),
                        t('tableHeaderType'),
                        t('tableHeaderStatus'),
                        t('tableHeaderInitiator'),
                        t('tableHeaderDate'),
                    ].map((h) => (
                        <span
                            key={h}
                            className='type-meta text-lucky-text-tertiary text-xs uppercase font-semibold tracking-wide'
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
                                className='grid grid-cols-1 md:grid-cols-[1fr_100px_80px_100px_80px] gap-2 md:gap-4 px-6 py-3'
                            >
                                <Skeleton className='h-3 w-32' />
                                <Skeleton className='h-3 w-20' />
                                <Skeleton className='h-5 w-16 rounded-full' />
                                <Skeleton className='h-3 w-24' />
                                <Skeleton className='h-3 w-20' />
                            </div>
                        ))
                    ) : jobs.length > 0 ? (
                        <AnimatePresence mode='wait'>
                            {jobs.map((job, i) => {
                                const style =
                                    STATUS_STYLES[job.status] ||
                                    STATUS_STYLES.pending
                                const StatusIcon = style.icon
                                const progressPercent =
                                    job.totalItems > 0
                                        ? Math.round(
                                              (job.processedItems /
                                                  job.totalItems) *
                                                  100,
                                          )
                                        : 0

                                return (
                                    <motion.div
                                        key={job.id}
                                        initial={
                                            prefersReducedMotion
                                                ? false
                                                : { opacity: 0 }
                                        }
                                        animate={{ opacity: 1 }}
                                        transition={{
                                            duration: 0.15,
                                            delay: prefersReducedMotion
                                                ? 0
                                                : i * 0.02,
                                        }}
                                        className='grid grid-cols-1 md:grid-cols-[1fr_100px_80px_100px_80px] gap-2 md:gap-4 px-6 py-3 items-center transition-colors hover:bg-lucky-bg-active/25 cursor-pointer'
                                        onClick={() => setSelectedJob(job)}
                                    >
                                        <div className='space-y-1'>
                                            <span className='type-body-sm text-lucky-text-primary truncate block'>
                                                {job.jobType}
                                            </span>
                                            <div className='flex gap-2 items-center text-xs'>
                                                <span className='type-meta text-lucky-text-tertiary'>
                                                    {job.processedItems} /{' '}
                                                    {job.totalItems}
                                                </span>
                                                <div className='relative w-24 h-1.5 bg-lucky-bg-tertiary rounded-full overflow-hidden'>
                                                    <div
                                                        className='h-full bg-blue-500 transition-all'
                                                        style={{
                                                            width: `${progressPercent}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <span className='type-body-sm text-lucky-text-secondary'>
                                            {job.jobType.substring(0, 10)}
                                        </span>
                                        <Badge
                                            variant='outline'
                                            className={cn(
                                                'text-[10px] uppercase font-semibold gap-1 border w-fit',
                                                style.bg,
                                                style.text,
                                                style.border,
                                            )}
                                        >
                                            <StatusIcon className='w-3 h-3' />
                                            {t(job.status)}
                                        </Badge>
                                        <span className='type-body-sm text-lucky-text-secondary truncate'>
                                            {job.initiatedBy}
                                        </span>
                                        <span className='type-body-sm text-lucky-text-tertiary text-xs'>
                                            {timeAgo(job.createdAt)}
                                        </span>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    ) : (
                        <EmptyState
                            icon={
                                <Clock
                                    className='w-10 h-10'
                                    aria-hidden='true'
                                />
                            }
                            title={t('noBatchJobsFound')}
                            description={
                                statusFilter !== 'all'
                                    ? t('tryAdjustingFilters')
                                    : t('batchJobsWillAppearHere')
                            }
                            className='rounded-none border-0 min-h-[240px]'
                        />
                    )}
                </div>

                {/* Pagination */}
                {total > limit && (
                    <div className='flex items-center justify-between px-5 py-3 border-t border-lucky-border'>
                        <span className='type-body-sm text-lucky-text-tertiary'>
                            {t('showingToOf', {
                                from: (page - 1) * limit + 1,
                                to: Math.min(page * limit, total),
                                total: total,
                            })}
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

            {/* Job Detail Modal */}
            <JobDetailPanel
                jobData={selectedJob}
                open={!!selectedJob}
                onClose={() => setSelectedJob(null)}
                onCancel={handleCancelJob}
                cancelling={
                    !!selectedJob && cancelllingJobId === selectedJob.id
                }
            />
        </div>
    )
}
