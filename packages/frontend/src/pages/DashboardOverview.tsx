import { motion } from 'framer-motion'
import {
    Users,
    Shield,
    MessageSquare,
    ShieldAlert,
    AlertTriangle,
    Ban,
    Clock,
    TrendingUp,
    TrendingDown,
    Activity,
    ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import { Badge } from '@/components/ui/badge'
import Skeleton from '@/components/ui/Skeleton'
import { useGuildStore } from '@/stores/guildStore'
import { cn } from '@/lib/utils'
import {
    useModerationStats,
    useModerationCases,
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

interface StatCardProps {
    title: string
    value: string | number
    change?: number
    icon: React.ComponentType<{ className?: string }>
    accent: string
    delay?: number
}

function StatCard({
    title,
    value,
    change,
    icon: Icon,
    accent,
    delay = 0,
}: StatCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay }}
        >
            <Card className='relative overflow-hidden p-5 hover:border-lukbot-border/80 transition-colors'>
                <div
                    className={cn(
                        'absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-10',
                        accent,
                    )}
                />
                <div className='flex items-start justify-between'>
                    <div className='space-y-2'>
                        <p className='text-sm text-lukbot-text-secondary'>
                            {title}
                        </p>
                        <p className='text-2xl font-bold text-white'>
                            {typeof value === 'number'
                                ? value.toLocaleString()
                                : value}
                        </p>
                        {change !== undefined && (
                            <div
                                className={cn(
                                    'flex items-center gap-1 text-xs font-medium',
                                    change >= 0
                                        ? 'text-lukbot-success'
                                        : 'text-lukbot-error',
                                )}
                            >
                                {change >= 0 ? (
                                    <TrendingUp className='w-3 h-3' />
                                ) : (
                                    <TrendingDown className='w-3 h-3' />
                                )}
                                <span>{Math.abs(change)}% from last week</span>
                            </div>
                        )}
                    </div>
                    <div
                        className={cn(
                            'p-2.5 rounded-xl',
                            accent.replace('bg-', 'bg-').replace('/10', '/15'),
                        )}
                    >
                        <Icon className='w-5 h-5 text-white' />
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

function CaseRow({ case: c, index }: { case: ModerationCase; index: number }) {
    const ActionIcon = ACTION_ICONS[c.type] || Shield
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            className='flex items-center gap-4 p-3 rounded-lg hover:bg-lukbot-bg-tertiary/50 transition-colors group'
        >
            <div className='w-8 text-center'>
                <span className='text-xs font-mono text-lukbot-text-tertiary'>
                    #{c.caseNumber}
                </span>
            </div>
            <div className='flex items-center gap-2.5 flex-1 min-w-0'>
                <div className='w-8 h-8 rounded-full bg-lukbot-bg-active flex items-center justify-center shrink-0'>
                    <span className='text-xs font-medium text-lukbot-text-secondary'>
                        {(c.userName || c.userId).substring(0, 2).toUpperCase()}
                    </span>
                </div>
                <div className='min-w-0'>
                    <p className='text-sm font-medium text-white truncate'>
                        {c.userName || c.userId}
                    </p>
                    <p className='text-xs text-lukbot-text-tertiary truncate'>
                        {c.reason || 'No reason provided'}
                    </p>
                </div>
            </div>
            <Badge
                variant='outline'
                className={cn(
                    'text-[10px] uppercase font-semibold gap-1 border',
                    ACTION_COLORS[c.type],
                )}
            >
                <ActionIcon className='w-3 h-3' />
                {c.type}
            </Badge>
            <span className='text-xs text-lukbot-text-tertiary whitespace-nowrap hidden sm:block'>
                {timeAgo(c.createdAt)}
            </span>
        </motion.div>
    )
}

function QuickActionButton({
    icon: Icon,
    label,
    to,
    accent,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    to: string
    accent: string
}) {
    return (
        <Link
            to={to}
            className={cn(
                'flex items-center gap-3 p-3 rounded-xl border border-lukbot-border bg-lukbot-bg-tertiary/50',
                'hover:bg-lukbot-bg-active hover:border-lukbot-border/80 transition-all group',
            )}
        >
            <div className={cn('p-2 rounded-lg', accent)}>
                <Icon className='w-4 h-4 text-white' />
            </div>
            <span className='text-sm font-medium text-lukbot-text-secondary group-hover:text-white transition-colors'>
                {label}
            </span>
            <ArrowRight className='w-4 h-4 ml-auto text-lukbot-text-tertiary group-hover:text-white transition-colors' />
        </Link>
    )
}

export default function DashboardOverview() {
    const { selectedGuild } = useGuildStore()

    const { data: stats, isLoading: statsLoading } = useModerationStats(
        selectedGuild?.id,
    )
    const { data: casesData, isLoading: casesLoading } = useModerationCases(
        selectedGuild?.id,
        { limit: 8 },
    )

    const recentCases = casesData?.cases ?? []
    const loading = statsLoading || casesLoading

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center h-[60vh] text-center'>
                <div className='w-20 h-20 bg-lukbot-bg-tertiary rounded-2xl flex items-center justify-center mb-4'>
                    <Activity className='w-10 h-10 text-lukbot-text-tertiary' />
                </div>
                <h2 className='text-xl font-semibold text-white mb-2'>
                    Select a Server
                </h2>
                <p className='text-lukbot-text-secondary text-sm'>
                    Choose a server from the sidebar to view its dashboard
                </p>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <header>
                <h1 className='text-2xl font-bold text-white'>Dashboard</h1>
                <p className='text-sm text-lukbot-text-secondary mt-1'>
                    Overview of {selectedGuild.name}
                </p>
            </header>

            {/* Stats Grid */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className='p-5'>
                            <Skeleton className='h-4 w-20 mb-3' />
                            <Skeleton className='h-8 w-16 mb-2' />
                            <Skeleton className='h-3 w-28' />
                        </Card>
                    ))
                ) : (
                    <>
                        <StatCard
                            title='Total Members'
                            value={selectedGuild.memberCount || 0}
                            icon={Users}
                            accent='bg-lukbot-blue'
                            delay={0}
                        />
                        <StatCard
                            title='Active Cases'
                            value={stats?.activeCases || 0}
                            change={stats?.recentCases ? 12 : undefined}
                            icon={Shield}
                            accent='bg-lukbot-red'
                            delay={0.05}
                        />
                        <StatCard
                            title='Total Cases'
                            value={stats?.totalCases || 0}
                            icon={MessageSquare}
                            accent='bg-lukbot-purple'
                            delay={0.1}
                        />
                        <StatCard
                            title='Auto-Mod Actions'
                            value={stats?.casesByType?.warn || 0}
                            icon={ShieldAlert}
                            accent='bg-amber-500'
                            delay={0.15}
                        />
                    </>
                )}
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                {/* Recent Cases */}
                <motion.div
                    className='lg:col-span-2'
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                >
                    <Card className='p-0 overflow-hidden'>
                        <div className='flex items-center justify-between px-5 py-4 border-b border-lukbot-border'>
                            <div>
                                <h2 className='text-base font-semibold text-white'>
                                    Recent Cases
                                </h2>
                                <p className='text-xs text-lukbot-text-tertiary mt-0.5'>
                                    Latest moderation actions
                                </p>
                            </div>
                            <Link
                                to='/moderation'
                                className='text-xs font-medium text-lukbot-red hover:text-lukbot-red/80 transition-colors flex items-center gap-1'
                            >
                                View all <ArrowRight className='w-3 h-3' />
                            </Link>
                        </div>
                        <div className='divide-y divide-lukbot-border/50'>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className='flex items-center gap-4 p-3 px-5'
                                    >
                                        <Skeleton className='w-8 h-4' />
                                        <Skeleton className='w-8 h-8 rounded-full' />
                                        <div className='flex-1 space-y-1.5'>
                                            <Skeleton className='h-4 w-32' />
                                            <Skeleton className='h-3 w-48' />
                                        </div>
                                        <Skeleton className='h-5 w-14 rounded-full' />
                                    </div>
                                ))
                            ) : recentCases.length > 0 ? (
                                recentCases.map((c, i) => (
                                    <CaseRow key={c.id} case={c} index={i} />
                                ))
                            ) : (
                                <div className='py-12 text-center'>
                                    <Shield className='w-10 h-10 text-lukbot-text-tertiary mx-auto mb-3' />
                                    <p className='text-sm text-lukbot-text-secondary'>
                                        No moderation cases yet
                                    </p>
                                    <p className='text-xs text-lukbot-text-tertiary mt-1'>
                                        Cases will appear here when moderators
                                        take action
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                </motion.div>

                {/* Quick Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                >
                    <Card className='p-5'>
                        <h2 className='text-base font-semibold text-white mb-1'>
                            Quick Actions
                        </h2>
                        <p className='text-xs text-lukbot-text-tertiary mb-4'>
                            Common management tasks
                        </p>
                        <div className='space-y-2'>
                            <QuickActionButton
                                icon={Shield}
                                label='Moderation Cases'
                                to='/moderation'
                                accent='bg-lukbot-red/20'
                            />
                            <QuickActionButton
                                icon={ShieldAlert}
                                label='Auto-Moderation'
                                to='/automod'
                                accent='bg-amber-500/20'
                            />
                            <QuickActionButton
                                icon={Activity}
                                label='Server Logs'
                                to='/logs'
                                accent='bg-lukbot-blue/20'
                            />
                            <QuickActionButton
                                icon={MessageSquare}
                                label='Custom Commands'
                                to='/commands'
                                accent='bg-lukbot-purple/20'
                            />
                        </div>

                        {/* Case Type Breakdown */}
                        {stats && (
                            <div className='mt-6 pt-4 border-t border-lukbot-border'>
                                <h3 className='text-sm font-medium text-lukbot-text-secondary mb-3'>
                                    Cases by Type
                                </h3>
                                <div className='space-y-2.5'>
                                    {Object.entries(
                                        stats.casesByType || {},
                                    ).map(([type, count]) => {
                                        const total = stats.totalCases || 1
                                        const pct = Math.round(
                                            (count / total) * 100,
                                        )
                                        return (
                                            <div key={type}>
                                                <div className='flex items-center justify-between mb-1'>
                                                    <span className='text-xs text-lukbot-text-secondary capitalize'>
                                                        {type}
                                                    </span>
                                                    <span className='text-xs font-medium text-white'>
                                                        {count}
                                                    </span>
                                                </div>
                                                <div className='h-1.5 bg-lukbot-bg-active rounded-full overflow-hidden'>
                                                    <motion.div
                                                        className={cn(
                                                            'h-full rounded-full',
                                                            type === 'warn'
                                                                ? 'bg-yellow-500'
                                                                : type ===
                                                                    'mute'
                                                                  ? 'bg-orange-500'
                                                                  : type ===
                                                                      'kick'
                                                                    ? 'bg-red-500'
                                                                    : type ===
                                                                        'ban'
                                                                      ? 'bg-red-600'
                                                                      : 'bg-lukbot-blue',
                                                        )}
                                                        initial={{ width: 0 }}
                                                        animate={{
                                                            width: `${pct}%`,
                                                        }}
                                                        transition={{
                                                            duration: 0.6,
                                                            delay: 0.4,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </Card>
                </motion.div>
            </div>
        </div>
    )
}
