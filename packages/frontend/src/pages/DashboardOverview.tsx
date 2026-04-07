import type { ReactElement } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Ban,
    Clock,
    MessageSquare,
    Music,
    ScrollText,
    Shield,
    ShieldAlert,
    Star,
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
import { useRecentTracks } from '@/hooks/useTrackHistoryQueries'
import { useLevelLeaderboard } from '@/hooks/useLevelQueries'
import { useStarboardTop } from '@/hooks/useStarboardQueries'
import type { ModerationCase, ModuleKey } from '@/types'

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
    const prefersReducedMotion = useReducedMotion()

    return (
        <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : index * 0.05 }}
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
    const prefersReducedMotion = useReducedMotion()
    const { selectedGuild, memberContext } = useGuildStore()
    const { data: stats, isLoading: statsLoading } = useModerationStats(
        selectedGuild?.id,
    )
    const { data: casesData, isLoading: casesLoading } = useModerationCases(
        selectedGuild?.id,
        { limit: 8 },
    )
    const { data: recentTracksData, isLoading: tracksLoading } = useRecentTracks(
        selectedGuild?.id,
        5,
    )
    const { data: leaderboardData, isLoading: leaderboardLoading } =
        useLevelLeaderboard(selectedGuild?.id, 5)
    const { data: starboardData, isLoading: starboardLoading } = useStarboardTop(
        selectedGuild?.id,
        3,
    )

    const recentCases = casesData?.cases ?? []
    const loading = statsLoading || casesLoading
    const effectiveAccess =
        memberContext?.effectiveAccess ?? selectedGuild?.effectiveAccess
    const quickActions: Array<{
        title: string
        description: string
        icon: ReactElement
        href: string
        module: ModuleKey
    }> = [
        {
            title: 'Moderation Cases',
            description: 'Review warnings, mutes, kicks, and bans.',
            icon: <Shield className='h-4 w-4' />,
            href: '/moderation',
            module: 'moderation',
        },
        {
            title: 'Auto-Moderation',
            description: 'Tune filters and anti-spam automation.',
            icon: <ShieldAlert className='h-4 w-4' />,
            href: '/automod',
            module: 'moderation',
        },
        {
            title: 'Server Logs',
            description: 'Audit events and moderation activity.',
            icon: <ScrollText className='h-4 w-4' />,
            href: '/logs',
            module: 'moderation',
        },
        {
            title: 'Custom Commands',
            description: 'Manage scripted server shortcuts.',
            icon: <MessageSquare className='h-4 w-4' />,
            href: '/commands',
            module: 'automation',
        },
        {
            title: 'Music Player',
            description: 'View queue, playback, and track history.',
            icon: <Music className='h-4 w-4' />,
            href: '/music',
            module: 'music',
        },
        {
            title: 'Levels & XP',
            description: 'Configure XP, level rewards, and leaderboards.',
            icon: <TrendingUp className='h-4 w-4' />,
            href: '/levels',
            module: 'settings',
        },
        {
            title: 'Starboard',
            description: 'Manage community highlights.',
            icon: <Star className='h-4 w-4' />,
            href: '/starboard',
            module: 'settings',
        },
    ]
    const visibleQuickActions = quickActions.filter((action) => {
        if (!selectedGuild || !effectiveAccess) {
            return true
        }
        return hasModuleAccess(effectiveAccess, action.module, 'view')
    })

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
                            value={stats?.activeCases || 0}
                            delta={stats?.recentCases ? 12 : undefined}
                            icon={<Shield className='h-4 w-4' />}
                            tone='accent'
                        />
                        <StatTile
                            label='Total Cases'
                            value={stats?.totalCases || 0}
                            icon={<MessageSquare className='h-4 w-4' />}
                            tone='neutral'
                        />
                        <StatTile
                            label='Auto-Mod Actions'
                            value={stats?.casesByType?.warn || 0}
                            icon={<ShieldAlert className='h-4 w-4' />}
                            tone='warning'
                        />
                    </>
                )}
            </div>

            <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
                <motion.section
                    className='surface-panel overflow-hidden lg:col-span-2'
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.2 }}
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
                            className='type-body-sm inline-flex items-center gap-1 text-lucky-brand transition-colors hover:text-lucky-brand-strong'
                        >
                            View all
                            <ArrowRight className='h-3.5 w-3.5' />
                        </Link>
                    </div>

                    <div className='divide-y divide-lucky-border/50'>
                        {loading ? (
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
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.3 }}
                >
                    <h2 className='type-title text-lucky-text-primary'>
                        Quick Actions
                    </h2>
                    {visibleQuickActions.map((action) => (
                        <ActionPanel
                            key={action.href}
                            title={action.title}
                            description={action.description}
                            icon={action.icon}
                            action={
                                <Link
                                    to={action.href}
                                    className='type-body-sm rounded-lg border border-lucky-border px-3 py-1.5 text-lucky-text-secondary hover:text-lucky-text-primary'
                                >
                                    Open
                                </Link>
                            }
                        />
                    ))}
                </motion.section>
            </div>

            {hasModuleAccess(effectiveAccess, 'music', 'view') && (
                <motion.section
                    className='surface-panel overflow-hidden'
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.4 }}
                >
                    <div className='flex items-center justify-between border-b border-lucky-border px-4 py-3'>
                        <div>
                            <h2 className='type-title text-lucky-text-primary'>
                                Recent Music
                            </h2>
                            <p className='type-body-sm text-lucky-text-tertiary'>
                                Latest tracks played
                            </p>
                        </div>
                        <Link
                            to='/music/history'
                            className='type-body-sm inline-flex items-center gap-1 text-lucky-brand transition-colors hover:text-lucky-brand-strong'
                        >
                            View all
                            <ArrowRight className='h-3.5 w-3.5' />
                        </Link>
                    </div>

                    <div className='divide-y divide-lucky-border/50'>
                        {tracksLoading ? (
                            Array.from({ length: 4 }).map((_, index) => (
                                <div
                                    key={index}
                                    className='grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2'
                                >
                                    <Skeleton className='h-4 w-32' />
                                    <Skeleton className='h-4 w-24' />
                                </div>
                            ))
                        ) : recentTracksData && recentTracksData.length > 0 ? (
                            recentTracksData.map((track, index) => (
                                <motion.div
                                    key={track.trackId}
                                    initial={
                                        prefersReducedMotion
                                            ? false
                                            : { opacity: 0, x: -8 }
                                    }
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{
                                        duration: 0.2,
                                        delay: prefersReducedMotion
                                            ? 0
                                            : index * 0.05,
                                    }}
                                    className='grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-lucky-bg-tertiary/50 sm:grid-cols-3'
                                >
                                    <div className='min-w-0'>
                                        <p className='type-body-sm truncate text-lucky-text-primary'>
                                            {track.title}
                                        </p>
                                        <p className='type-body-sm truncate text-lucky-text-tertiary'>
                                            {track.author}
                                        </p>
                                    </div>
                                    <p className='type-body-sm text-lucky-text-secondary'>
                                        {track.playedBy || '—'}
                                    </p>
                                    <p className='text-xs text-lucky-text-tertiary text-right'>
                                        {timeAgo(
                                            new Date(
                                                track.timestamp,
                                            ).toISOString(),
                                        )}
                                    </p>
                                </motion.div>
                            ))
                        ) : (
                            <div className='px-4 py-10 text-center'>
                                <Music className='mx-auto mb-3 h-10 w-10 text-lucky-text-tertiary' />
                                <p className='type-body text-lucky-text-secondary'>
                                    No tracks played yet
                                </p>
                                <p className='type-body-sm text-lucky-text-tertiary'>
                                    Track history will appear here when music is
                                    played
                                </p>
                            </div>
                        )}
                    </div>
                </motion.section>
            )}

            {hasModuleAccess(effectiveAccess, 'settings', 'view') && (
                <motion.section
                    className='space-y-4'
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.5 }}
                >
                    <h2 className='type-title text-lucky-text-primary'>
                        Community
                    </h2>
                    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                        <div className='surface-panel overflow-hidden'>
                            <div className='border-b border-lucky-border px-4 py-3'>
                                <h3 className='type-body-sm font-semibold text-lucky-text-primary'>
                                    Level Leaderboard
                                </h3>
                                <p className='type-body-sm text-lucky-text-tertiary'>
                                    Top members by XP
                                </p>
                            </div>

                            <div className='divide-y divide-lucky-border/50'>
                                {leaderboardLoading ? (
                                    Array.from({ length: 4 }).map(
                                        (_, index) => (
                                            <div
                                                key={index}
                                                className='grid grid-cols-3 gap-2 px-4 py-3'
                                            >
                                                <Skeleton className='h-4 w-24' />
                                                <Skeleton className='h-4 w-16' />
                                                <Skeleton className='h-4 w-12 justify-self-end' />
                                            </div>
                                        ),
                                    )
                                ) : leaderboardData &&
                                  leaderboardData.length > 0 ? (
                                    leaderboardData.map((member, index) => (
                                        <motion.div
                                            key={member.userId}
                                            initial={
                                                prefersReducedMotion
                                                    ? false
                                                    : { opacity: 0, x: -8 }
                                            }
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                duration: 0.2,
                                                delay: prefersReducedMotion
                                                    ? 0
                                                    : index * 0.05,
                                            }}
                                            className='grid grid-cols-3 items-center gap-2 px-4 py-3 transition-colors hover:bg-lucky-bg-tertiary/50'
                                        >
                                            <p className='type-body-sm text-lucky-text-primary'>
                                                Lv{member.level}
                                            </p>
                                            <p className='type-body-sm truncate text-lucky-text-secondary'>
                                                {member.userId}
                                            </p>
                                            <p className='text-xs text-lucky-text-tertiary text-right'>
                                                {member.xp.toLocaleString()}
                                                 XP
                                            </p>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className='px-4 py-8 text-center'>
                                        <TrendingUp className='mx-auto mb-2 h-8 w-8 text-lucky-text-tertiary' />
                                        <p className='type-body-sm text-lucky-text-secondary'>
                                            No leaderboard data
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className='surface-panel overflow-hidden'>
                            <div className='border-b border-lucky-border px-4 py-3'>
                                <h3 className='type-body-sm font-semibold text-lucky-text-primary'>
                                    Starboard Highlights
                                </h3>
                                <p className='type-body-sm text-lucky-text-tertiary'>
                                    Top starred messages
                                </p>
                            </div>

                            <div className='divide-y divide-lucky-border/50'>
                                {starboardLoading ? (
                                    Array.from({ length: 3 }).map(
                                        (_, index) => (
                                            <div
                                                key={index}
                                                className='grid grid-cols-2 gap-2 px-4 py-3'
                                            >
                                                <Skeleton className='h-4 w-20' />
                                                <Skeleton className='h-4 w-12 justify-self-end' />
                                            </div>
                                        ),
                                    )
                                ) : starboardData &&
                                  starboardData.length > 0 ? (
                                    starboardData.map((entry, index) => (
                                        <motion.div
                                            key={entry.id}
                                            initial={
                                                prefersReducedMotion
                                                    ? false
                                                    : { opacity: 0, x: -8 }
                                            }
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                duration: 0.2,
                                                delay: prefersReducedMotion
                                                    ? 0
                                                    : index * 0.05,
                                            }}
                                            className='grid grid-cols-2 items-center gap-2 px-4 py-3 transition-colors hover:bg-lucky-bg-tertiary/50'
                                        >
                                            <p className='type-body-sm truncate text-lucky-text-primary'>
                                                {entry.content
                                                    ? entry.content.substring(
                                                          0,
                                                          30,
                                                      ) + '...'
                                                    : 'Message'}
                                            </p>
                                            <div className='flex items-center justify-end gap-1 text-xs text-lucky-text-tertiary'>
                                                <Star className='h-3 w-3' />
                                                {entry.starCount}
                                            </div>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className='px-4 py-8 text-center'>
                                        <Star className='mx-auto mb-2 h-8 w-8 text-lucky-text-tertiary' />
                                        <p className='type-body-sm text-lucky-text-secondary'>
                                            No starred messages
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.section>
            )}

            {Object.keys(stats?.casesByType ?? {}).length > 0 && (
                <section className='space-y-4'>
                    <h2 className='type-title text-lucky-text-primary'>
                        Cases by Type
                    </h2>
                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
                        {Object.entries(stats?.casesByType ?? {}).map(
                            ([type, value]) => (
                                <StatTile
                                    key={type}
                                    label={type.charAt(0).toUpperCase() + type.slice(1)}
                                    value={value as number}
                                    tone='neutral'
                                />
                            ),
                        )}
                    </div>
                </section>
            )}
        </div>
    )
}
