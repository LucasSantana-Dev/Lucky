import { motion } from 'framer-motion'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Ban,
    Clock,
    MessageSquare,
    ScrollText,
    Shield,
    ShieldAlert,
    TrendingDown,
    TrendingUp,
    Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import EmptyState from '@/components/ui/EmptyState'
import StatTile from '@/components/ui/StatTile'
import ActionPanel from '@/components/ui/ActionPanel'
import { useGuildStore } from '@/stores/guildStore'
import { hasModuleAccess } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import {
    useModerationCases,
    useModerationStats,
} from '@/hooks/useModerationQueries'
import type { ModerationCase } from '@/types'

const ACTION_COLORS: Record<string, string> = {
    warn: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    mute: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    kick: 'bg-red-500/15 text-red-400 border-red-500/30',
    ban: 'bg-red-600/15 text-red-300 border-red-600/30',
    unban: 'bg-green-500/15 text-green-400 border-green-500/30',
    unmute: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
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

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`

    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`

    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`

    return new Date(dateStr).toLocaleDateString()
}

function CaseRow({ case: c, index }: { case: ModerationCase; index: number }) {
    const ActionIcon = ACTION_ICONS[c.type] || Shield

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            className='grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-lucky-bg-tertiary/50'
        >
            <p className='text-xs font-mono text-lucky-text-tertiary'>
                #{c.caseNumber}
            </p>
            <div className='min-w-0'>
                <p className='type-body-sm truncate text-lucky-text-primary'>
                    {c.userName || c.userId}
                </p>
                <p className='type-body-sm truncate text-lucky-text-tertiary'>
                    {c.reason || 'No reason provided'}
                </p>
            </div>
            <div className='flex items-center gap-2'>
                <Badge
                    variant='outline'
                    className={cn(
                        'border text-[10px] font-semibold uppercase',
                        ACTION_COLORS[c.type],
                    )}
                >
                    <ActionIcon className='mr-1 h-3 w-3' />
                    {c.type}
                </Badge>
                <span className='hidden text-xs text-lucky-text-tertiary sm:block'>
                    {timeAgo(c.createdAt)}
                </span>
            </div>
        </motion.div>
    )
}

export default function DashboardOverview() {
    const { selectedGuild, memberContext } = useGuildStore()
    const effectiveAccess =
        memberContext?.effectiveAccess ?? selectedGuild?.effectiveAccess
    const canViewModeration = hasModuleAccess(
        effectiveAccess,
        'moderation',
        'view',
    )
    const { data: stats, isLoading: statsLoading } = useModerationStats(
        canViewModeration ? selectedGuild?.id : undefined,
    )
    const { data: casesData, isLoading: casesLoading } = useModerationCases(
        canViewModeration ? selectedGuild?.id : undefined,
        { limit: 8 },
    )

    const recentCases = casesData?.cases ?? []
    const loading = canViewModeration && (statsLoading || casesLoading)
    const quickActions = [
        {
            module: 'moderation' as const,
            title: 'Moderation Cases',
            description: 'Review warnings, mutes, kicks, and bans.',
            icon: <Shield className='h-4 w-4' />,
            to: '/moderation',
        },
        {
            module: 'moderation' as const,
            title: 'Auto-Moderation',
            description: 'Tune filters and anti-spam automation.',
            icon: <ShieldAlert className='h-4 w-4' />,
            to: '/automod',
        },
        {
            module: 'moderation' as const,
            title: 'Server Logs',
            description: 'Audit events and moderation activity.',
            icon: <ScrollText className='h-4 w-4' />,
            to: '/logs',
        },
        {
            module: 'automation' as const,
            title: 'Custom Commands',
            description: 'Manage scripted server shortcuts.',
            icon: <MessageSquare className='h-4 w-4' />,
            to: '/commands',
        },
    ].filter((action) =>
        hasModuleAccess(effectiveAccess, action.module, 'view'),
    )

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Activity className='h-10 w-10' />}
                title='Select a Server'
                description='Choose a server from the sidebar to view its dashboard'
            />
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                title='Dashboard'
                description={`Overview of ${selectedGuild.name}`}
                eyebrow='Server analytics'
            />

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                {loading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className='surface-panel p-5'>
                            <Skeleton className='mb-3 h-4 w-20' />
                            <Skeleton className='mb-2 h-8 w-16' />
                            <Skeleton className='h-3 w-28' />
                        </div>
                    ))
                ) : (
                    <>
                        <StatTile
                            label='Total Members'
                            value={selectedGuild.memberCount ?? '—'}
                            icon={<Users className='h-4 w-4' />}
                            tone='brand'
                        />
                        <StatTile
                            label='Active Cases'
                            value={
                                canViewModeration
                                    ? (stats?.activeCases ?? 0)
                                    : '—'
                            }
                            delta={
                                canViewModeration && stats?.recentCases
                                    ? 12
                                    : undefined
                            }
                            icon={<Shield className='h-4 w-4' />}
                            tone='accent'
                        />
                        <StatTile
                            label='Total Cases'
                            value={
                                canViewModeration
                                    ? (stats?.totalCases ?? 0)
                                    : '—'
                            }
                            icon={<MessageSquare className='h-4 w-4' />}
                            tone='neutral'
                        />
                        <StatTile
                            label='Auto-Mod Actions'
                            value={
                                canViewModeration
                                    ? (stats?.casesByType?.warn ?? 0)
                                    : '—'
                            }
                            icon={<ShieldAlert className='h-4 w-4' />}
                            tone='warning'
                        />
                    </>
                )}
            </div>

            <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
                <motion.section
                    className='surface-panel overflow-hidden lg:col-span-2'
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                >
                    <div className='flex items-center justify-between border-b border-lucky-border px-4 py-3'>
                        <div>
                            <h2 className='type-title text-lucky-text-primary'>
                                Recent Cases
                            </h2>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Latest moderation actions
                            </p>
                        </div>
                        <Link
                            to='/moderation'
                            className='type-body-sm inline-flex items-center gap-1 text-lucky-accent transition-colors hover:text-lucky-accent-soft'
                        >
                            View all
                            <ArrowRight className='h-3.5 w-3.5' />
                        </Link>
                    </div>

                    <div className='divide-y divide-lucky-border/50'>
                        {!canViewModeration ? (
                            <div className='px-4 py-10 text-center'>
                                <Shield className='mx-auto mb-3 h-10 w-10 text-lucky-text-tertiary' />
                                <p className='type-body text-lucky-text-secondary'>
                                    Moderation insights unavailable
                                </p>
                                <p className='type-body-sm text-lucky-text-tertiary'>
                                    You need moderation view access to inspect
                                    case activity.
                                </p>
                            </div>
                        ) : loading ? (
                            Array.from({ length: 5 }).map((_, index) => (
                                <div
                                    key={index}
                                    className='grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-3'
                                >
                                    <Skeleton className='h-4 w-8' />
                                    <div className='space-y-1.5'>
                                        <Skeleton className='h-4 w-28' />
                                        <Skeleton className='h-3 w-44' />
                                    </div>
                                    <Skeleton className='h-5 w-16 rounded-full' />
                                </div>
                            ))
                        ) : recentCases.length > 0 ? (
                            recentCases.map((item, index) => (
                                <CaseRow
                                    key={item.id}
                                    case={item}
                                    index={index}
                                />
                            ))
                        ) : (
                            <div className='px-4 py-10 text-center'>
                                <Shield className='mx-auto mb-3 h-10 w-10 text-lucky-text-tertiary' />
                                <p className='type-body text-lucky-text-secondary'>
                                    No moderation cases yet
                                </p>
                                <p className='type-body-sm text-lucky-text-tertiary'>
                                    Cases will appear here when moderators take
                                    action
                                </p>
                            </div>
                        )}
                    </div>
                </motion.section>

                <motion.section
                    className='space-y-4'
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                >
                    <h2 className='type-title text-lucky-text-primary'>
                        Quick Actions
                    </h2>
                    {quickActions.length === 0 ? (
                        <div className='surface-panel px-4 py-6 text-center'>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                No quick actions available for your access
                                level.
                            </p>
                        </div>
                    ) : (
                        quickActions.map((action) => (
                            <ActionPanel
                                key={action.to}
                                title={action.title}
                                description={action.description}
                                icon={action.icon}
                                action={
                                    <Link
                                        to={action.to}
                                        className='type-body-sm rounded-lg border border-lucky-border px-3 py-1.5 text-lucky-text-secondary hover:text-lucky-text-primary'
                                    >
                                        Open
                                    </Link>
                                }
                            />
                        ))
                    )}
                </motion.section>
            </div>

            <section className='surface-panel p-5'>
                <h2 className='type-title text-lucky-text-primary'>
                    Cases by Type
                </h2>
                <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
                    {Object.entries(stats?.casesByType ?? {}).map(
                        ([type, value]) => {
                            const delta = type === 'warn' ? 8 : -3
                            return (
                                <div
                                    key={type}
                                    className='rounded-xl border border-lucky-border bg-lucky-bg-tertiary/70 p-3'
                                >
                                    <p className='type-meta text-lucky-text-tertiary'>
                                        {type}
                                    </p>
                                    <p className='type-title text-lucky-text-primary'>
                                        {value}
                                    </p>
                                    <p
                                        className={cn(
                                            'type-body-sm inline-flex items-center gap-1',
                                            delta >= 0
                                                ? 'text-lucky-success'
                                                : 'text-lucky-error',
                                        )}
                                    >
                                        {delta >= 0 ? (
                                            <TrendingUp className='h-3.5 w-3.5' />
                                        ) : (
                                            <TrendingDown className='h-3.5 w-3.5' />
                                        )}
                                        {Math.abs(delta)}%
                                    </p>
                                </div>
                            )
                        },
                    )}
                </div>
            </section>
        </div>
    )
}
