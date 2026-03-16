import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    GitBranch,
    Play,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    FileJson,
    Loader2,
    Zap,
} from 'lucide-react'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import SectionHeader from '@/components/ui/SectionHeader'
import { Badge } from '@/components/ui/badge'
import Skeleton from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import type {
    AutomationRun,
    GuildAutomationManifest,
    PlanResult,
    ApplyResult,
} from '@/services/automationApi'

function statusColor(status: string): string {
    switch (status.toLowerCase()) {
        case 'success':
        case 'applied':
            return 'bg-green-500/10 text-green-400 border-green-500/20'
        case 'failed':
        case 'error':
            return 'bg-red-500/10 text-red-400 border-red-500/20'
        case 'pending':
        case 'running':
            return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        default:
            return 'bg-lucky-bg-active/60 text-lucky-text-muted border-lucky-border'
    }
}

function StatusIcon({ status }: { status: string }) {
    switch (status.toLowerCase()) {
        case 'success':
        case 'applied':
            return <CheckCircle2 className='h-4 w-4 text-green-400' />
        case 'failed':
        case 'error':
            return <XCircle className='h-4 w-4 text-red-400' />
        case 'running':
        case 'pending':
            return <Clock className='h-4 w-4 text-yellow-400' />
        default:
            return <Clock className='h-4 w-4 text-lucky-text-muted' />
    }
}

function RunCard({ run }: { run: AutomationRun }) {
    const [expanded, setExpanded] = useState(false)
    const date = new Date(run.createdAt).toLocaleString()
    return (
        <motion.div
            layout
            className='surface-panel rounded-lg p-4 space-y-2'
        >
            <div className='flex items-start justify-between gap-2'>
                <div className='flex items-center gap-2'>
                    <StatusIcon status={run.status} />
                    <span className='text-sm font-medium text-lucky-text-strong capitalize'>{run.type}</span>
                    <Badge className={`text-xs border ${statusColor(run.status)}`}>{run.status}</Badge>
                </div>
                <div className='flex items-center gap-2'>
                    <span className='text-xs text-lucky-text-muted'>{date}</span>
                    {run.summary && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className='text-lucky-text-muted hover:text-lucky-text-body'
                        >
                            {expanded ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />}
                        </button>
                    )}
                </div>
            </div>
            <AnimatePresence>
                {expanded && run.summary && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className='overflow-hidden'
                    >
                        <p className='text-xs text-lucky-text-muted font-mono bg-lucky-bg-primary/60 rounded p-2 break-all'>
                            {run.summary}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
            {run.error && (
                <p className='text-xs text-red-400 font-mono bg-red-500/5 rounded p-2 break-all'>{run.error}</p>
            )}
        </motion.div>
    )
}

function PlanResultView({ result }: { result: PlanResult }) {
    return (
        <div className='space-y-3'>
            <p className='text-sm text-lucky-text-body'>{result.summary}</p>
            {result.changes.length > 0 ? (
                <div className='space-y-2'>
                    {result.changes.map((change, i) => (
                        <div
                            key={i}
                            className='surface-panel rounded p-3 flex items-center gap-3'
                        >
                            <Badge className={`text-xs border ${change.action === 'create' ? 'bg-green-500/10 text-green-400 border-green-500/20' : change.action === 'delete' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                                {change.action}
                            </Badge>
                            <span className='text-xs text-lucky-text-muted capitalize'>{change.type}</span>
                            <span className='text-xs text-lucky-text-strong font-mono'>{change.resource}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className='text-sm text-lucky-text-muted'>No changes detected.</p>
            )}
        </div>
    )
}

function ApplyResultView({ result }: { result: ApplyResult }) {
    return (
        <div className='space-y-3'>
            <div className='flex gap-4'>
                <span className='text-sm text-green-400'>{result.applied} applied</span>
                {result.failed > 0 && (
                    <span className='text-sm text-red-400'>{result.failed} failed</span>
                )}
            </div>
            <p className='text-sm text-lucky-text-body'>{result.summary}</p>
            {result.changes.length > 0 && (
                <div className='space-y-2'>
                    {result.changes.map((change, i) => (
                        <div
                            key={i}
                            className='surface-panel rounded p-3 flex items-center gap-3'
                        >
                            <StatusIcon status={change.status} />
                            <Badge className={`text-xs border ${statusColor(change.status)}`}>{change.status}</Badge>
                            <span className='text-xs text-lucky-text-muted capitalize'>{change.type}</span>
                            <span className='text-xs text-lucky-text-strong font-mono'>{change.resource}</span>
                            {change.error && (
                                <span className='text-xs text-red-400 ml-auto'>{change.error}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function GuildAutomation() {
    const { selectedGuild } = useGuildStore()
    const [status, setStatus] = useState<string | null>(null)
    const [runs, setRuns] = useState<AutomationRun[]>([])
    const [manifest, setManifest] = useState<GuildAutomationManifest | null>(null)
    const [manifestJson, setManifestJson] = useState<string>('')
    const [manifestError, setManifestError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [planResult, setPlanResult] = useState<PlanResult | null>(null)
    const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
    const [manifestExpanded, setManifestExpanded] = useState(false)

    const fetchData = useCallback(async () => {
        if (!selectedGuild) return
        setLoading(true)
        try {
            const [statusRes, manifestRes] = await Promise.allSettled([
                api.automation.getStatus(selectedGuild.id),
                api.automation.getManifest(selectedGuild.id),
            ])
            if (statusRes.status === 'fulfilled') {
                setStatus(statusRes.value.status)
                setRuns(statusRes.value.runs ?? [])
            }
            if (manifestRes.status === 'fulfilled') {
                const m = manifestRes.value
                setManifest(m)
                setManifestJson(m ? JSON.stringify(m, null, 2) : '')
            }
        } finally {
            setLoading(false)
        }
    }, [selectedGuild])

    useEffect(() => {
        void fetchData()
    }, [fetchData])

    const handleSaveManifest = useCallback(async () => {
        if (!selectedGuild) return
        setManifestError(null)
        let parsed: GuildAutomationManifest
        try {
            parsed = JSON.parse(manifestJson) as GuildAutomationManifest
        } catch {
            setManifestError('Invalid JSON — please fix syntax errors before saving.')
            return
        }
        setActionLoading('save')
        try {
            await api.automation.updateManifest(selectedGuild.id, parsed)
            toast.success('Manifest saved successfully.')
            await fetchData()
        } catch {
            toast.error('Failed to save manifest.')
        } finally {
            setActionLoading(null)
        }
    }, [selectedGuild, manifestJson, fetchData])

    const handlePlan = useCallback(async () => {
        if (!selectedGuild) return
        setActionLoading('plan')
        setPlanResult(null)
        setApplyResult(null)
        try {
            const result = await api.automation.plan(selectedGuild.id)
            setPlanResult(result)
            toast.success('Plan generated.')
        } catch {
            toast.error('Failed to generate plan.')
        } finally {
            setActionLoading(null)
        }
    }, [selectedGuild])

    const handleApply = useCallback(async () => {
        if (!selectedGuild) return
        setActionLoading('apply')
        setPlanResult(null)
        setApplyResult(null)
        try {
            const result = await api.automation.apply(selectedGuild.id)
            setApplyResult(result)
            toast.success('Changes applied.')
            await fetchData()
        } catch {
            toast.error('Failed to apply changes.')
        } finally {
            setActionLoading(null)
        }
    }, [selectedGuild, fetchData])

    const handleReconcile = useCallback(async () => {
        if (!selectedGuild) return
        setActionLoading('reconcile')
        setPlanResult(null)
        setApplyResult(null)
        try {
            const result = await api.automation.reconcile(selectedGuild.id)
            setApplyResult(result)
            toast.success('Reconciliation complete.')
            await fetchData()
        } catch {
            toast.error('Failed to reconcile.')
        } finally {
            setActionLoading(null)
        }
    }, [selectedGuild, fetchData])

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<GitBranch className='h-10 w-10' />}
                title='No server selected'
                description='Select a server to manage Guild Automation.'
            />
        )
    }

    return (
        <div className='space-y-6 p-6'>
            <SectionHeader
                title='Guild Automation'
                description='Manage your guild configuration as code — plan, apply, and track changes.'
            />

            {/* Status + Actions */}
            <Card className='p-5 space-y-4'>
                <div className='flex items-center justify-between flex-wrap gap-3'>
                    <div className='flex items-center gap-3'>
                        <h2 className='text-sm font-semibold text-lucky-text-strong'>Automation Status</h2>
                        {loading ? (
                            <Skeleton className='h-5 w-20 rounded' />
                        ) : status ? (
                            <Badge className={`text-xs border ${statusColor(status)}`}>{status}</Badge>
                        ) : (
                            <Badge className='text-xs border bg-lucky-bg-active/60 text-lucky-text-muted border-lucky-border'>unknown</Badge>
                        )}
                    </div>
                    <button
                        onClick={() => void fetchData()}
                        disabled={loading}
                        className='text-lucky-text-muted hover:text-lucky-text-body disabled:opacity-40 transition-colors'
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                <div className='flex flex-wrap gap-2'>
                    <Button
                        variant='secondary'
                        size='sm'
                        onClick={() => void handlePlan()}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'plan' ? (
                            <Loader2 className='h-3 w-3 animate-spin' />
                        ) : (
                            <GitBranch className='h-3 w-3' />
                        )}
                        Plan
                    </Button>
                    <Button
                        variant='primary'
                        size='sm'
                        onClick={() => void handleApply()}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'apply' ? (
                            <Loader2 className='h-3 w-3 animate-spin' />
                        ) : (
                            <Play className='h-3 w-3' />
                        )}
                        Apply
                    </Button>
                    <Button
                        variant='secondary'
                        size='sm'
                        onClick={() => void handleReconcile()}
                        disabled={!!actionLoading}
                    >
                        {actionLoading === 'reconcile' ? (
                            <Loader2 className='h-3 w-3 animate-spin' />
                        ) : (
                            <RefreshCw className='h-3 w-3' />
                        )}
                        Reconcile
                    </Button>
                </div>
            </Card>

            {/* Plan / Apply Results */}
            <AnimatePresence>
                {planResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                    >
                        <Card className='p-5 space-y-3'>
                            <div className='flex items-center gap-2'>
                                <GitBranch className='h-4 w-4 text-lucky-brand' />
                                <h2 className='text-sm font-semibold text-lucky-text-strong'>Plan Result</h2>
                            </div>
                            <PlanResultView result={planResult} />
                        </Card>
                    </motion.div>
                )}
                {applyResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                    >
                        <Card className='p-5 space-y-3'>
                            <div className='flex items-center gap-2'>
                                <Zap className='h-4 w-4 text-lucky-accent' />
                                <h2 className='text-sm font-semibold text-lucky-text-strong'>Apply Result</h2>
                            </div>
                            <ApplyResultView result={applyResult} />
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Manifest Editor */}
            <Card className='p-5 space-y-4'>
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                        <FileJson className='h-4 w-4 text-lucky-brand' />
                        <h2 className='text-sm font-semibold text-lucky-text-strong'>Manifest</h2>
                        {manifest?.version && (
                            <Badge className='text-xs border bg-lucky-bg-active/60 text-lucky-text-muted border-lucky-border'>
                                v{manifest.version}
                            </Badge>
                        )}
                    </div>
                    <button
                        onClick={() => setManifestExpanded(!manifestExpanded)}
                        className='text-lucky-text-muted hover:text-lucky-text-body transition-colors text-xs flex items-center gap-1'
                    >
                        {manifestExpanded ? 'Collapse' : 'Expand'}
                        {manifestExpanded ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />}
                    </button>
                </div>
                {loading ? (
                    <Skeleton className='h-40 w-full rounded' />
                ) : (
                    <AnimatePresence initial={false}>
                        {manifestExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className='overflow-hidden space-y-3'
                            >
                                {!manifest && (
                                    <p className='text-sm text-lucky-text-muted flex items-center gap-2'>
                                        <AlertTriangle className='h-4 w-4 text-yellow-400' />
                                        No manifest found. Paste or write a manifest below to get started.
                                    </p>
                                )}
                                <textarea
                                    value={manifestJson}
                                    onChange={(e) => setManifestJson(e.target.value)}
                                    rows={16}
                                    spellCheck={false}
                                    className='w-full rounded-lg bg-lucky-bg-primary/80 border border-lucky-border text-lucky-text-body font-mono text-xs p-3 resize-y focus:outline-none focus:border-lucky-brand transition-colors'
                                    placeholder='{ "guildId": "...", "version": "1", "roles": {}, "channels": {} }'
                                />
                                {manifestError && (
                                    <p className='text-xs text-red-400 flex items-center gap-1'>
                                        <XCircle className='h-3 w-3' />
                                        {manifestError}
                                    </p>
                                )}
                                <div className='flex gap-2'>
                                    <Button
                                        variant='primary'
                                        size='sm'
                                        onClick={() => void handleSaveManifest()}
                                        disabled={actionLoading === 'save'}
                                    >
                                        {actionLoading === 'save' ? (
                                            <Loader2 className='h-3 w-3 animate-spin' />
                                        ) : null}
                                        Save Manifest
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </Card>

            {/* Run History */}
            <div className='space-y-3'>
                <SectionHeader title='Run History' />
                {loading ? (
                    <div className='space-y-2'>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className='h-14 w-full rounded-lg' />
                        ))}
                    </div>
                ) : runs.length === 0 ? (
                    <EmptyState
                        icon={<Clock className='h-8 w-8' />}
                        title='No runs yet'
                        description='Run a plan or apply to see results here.'
                    />
                ) : (
                    <div className='space-y-2'>
                        <AnimatePresence>
                            {runs.map((run) => (
                                <RunCard key={run.id} run={run} />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    )
}
