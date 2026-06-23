import { Crown, LayoutGrid, Settings, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Skeleton from '@/components/ui/Skeleton'
import ServerGrid from '@/components/Dashboard/ServerGrid'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { cn } from '@/lib/utils'

export default function ServersPage() {
    const guilds = useGuildStore((state) => state.guilds)
    const isLoading = useGuildStore((state) => state.isLoading)
    const user = useAuthStore((state) => state.user)
    const navigate = useNavigate()

    usePageMetadata({
        title: 'Servers - Lucky',
        description: 'Manage your Discord servers with Lucky',
    })

    const withBotCount = guilds.filter((g) => g.botAdded).length
    const primaryGuild = guilds[0]
    const secondaryGuilds = guilds.slice(1)

    if (isLoading) {
        return (
            <main className='space-y-8'>
                <div className='surface-panel flex items-center gap-4 p-6'>
                    <Skeleton className='h-16 w-16 rounded-full' />
                    <div className='space-y-2 flex-1'>
                        <Skeleton className='h-6 w-32' />
                        <Skeleton className='h-4 w-40' />
                    </div>
                </div>
                <div className='space-y-4'>
                    <Skeleton className='h-8 w-48' />
                    <Skeleton className='h-40 w-full' />
                </div>
            </main>
        )
    }

    return (
        <main className='space-y-8'>
            <div className='surface-panel flex flex-wrap items-center gap-6 p-6 border border-lucky-border'>
                <Avatar className='h-16 w-16 border border-lucky-border flex-shrink-0'>
                    <AvatarImage
                        src={user?.avatar || undefined}
                        alt={user?.username || 'User avatar'}
                    />
                    <AvatarFallback className='bg-lucky-brand/20 font-semibold text-lucky-brand'>
                        {user?.username?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                <div className='space-y-1'>
                    <p className='text-xs uppercase tracking-wider font-semibold text-lucky-text-tertiary'>
                        Discord Account
                    </p>
                    <p className='text-lg font-semibold text-lucky-text-primary'>
                        {user?.username}
                    </p>
                    <p className='text-sm text-lucky-text-secondary'>
                        @{user?.username}
                    </p>
                </div>

                <div className='ml-auto text-right flex-shrink-0'>
                    <p className='text-xs uppercase tracking-wider font-semibold text-lucky-text-tertiary'>
                        Total Servers
                    </p>
                    <p className='text-2xl font-bold text-lucky-brand'>
                        {guilds.length}
                    </p>
                </div>
            </div>

            <div className='space-y-6'>
                <div className='flex items-baseline justify-between'>
                    <div>
                        <div className='flex items-center gap-2'>
                            <h2 className='text-xs uppercase tracking-wider font-semibold text-lucky-text-tertiary'>
                                Servers
                            </h2>
                        </div>
                        <h1
                            className='text-3xl font-bold text-lucky-text-primary mt-2'
                            style={{ fontFamily: 'var(--font-lucky-display)' }}
                        >
                            Your Servers
                        </h1>
                        <p className='text-sm text-lucky-text-tertiary mt-2'>
                            {guilds.length} servers — {withBotCount} with Lucky
                            installed
                        </p>
                    </div>
                    <nav className='flex gap-2'>
                        {(
                            [
                                {
                                    label: 'Servers',
                                    icon: LayoutGrid,
                                    active: true,
                                    onClick: undefined,
                                },
                                {
                                    label: 'Premium',
                                    icon: Crown,
                                    active: false,
                                    onClick: () => navigate('/features'),
                                },
                                {
                                    label: 'Settings',
                                    icon: Settings,
                                    active: false,
                                    onClick: () => navigate('/settings'),
                                },
                            ] as const
                        ).map(({ label, icon: Icon, active, onClick }) => (
                            <button
                                key={label}
                                className={cn(
                                    'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                                    active
                                        ? 'border-lucky-border-strong bg-lucky-bg-active text-lucky-text-primary'
                                        : 'border-lucky-border bg-transparent text-lucky-text-secondary hover:text-lucky-text-primary hover:bg-lucky-bg-tertiary',
                                )}
                                aria-current={active ? 'page' : undefined}
                                onClick={onClick}
                            >
                                <Icon className='h-4 w-4' />
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>

                {primaryGuild && (
                    <section className='space-y-3'>
                        <h2 className='text-xs uppercase tracking-wider font-semibold text-lucky-text-tertiary'>
                            Recently Active
                        </h2>
                        <button
                            onClick={() =>
                                navigate(`/guild/${primaryGuild.id}`)
                            }
                            className={cn(
                                'surface-panel w-full p-6 text-left border-2 transition-all hover:bg-lucky-bg-active/25 hover:border-lucky-brand/50',
                                primaryGuild.botAdded
                                    ? 'border-lucky-border-strong'
                                    : 'border-lucky-border',
                            )}
                        >
                            <div className='flex items-start gap-4'>
                                <Avatar className='h-14 w-14 border border-lucky-border flex-shrink-0'>
                                    <AvatarImage
                                        src={primaryGuild.icon || undefined}
                                        alt={primaryGuild.name}
                                    />
                                    <AvatarFallback className='bg-lucky-brand/15 text-lucky-brand font-semibold'>
                                        {primaryGuild.name
                                            .substring(0, 2)
                                            .toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className='flex-1 min-w-0'>
                                    <h3 className='text-base font-semibold text-lucky-text-primary truncate'>
                                        {primaryGuild.name}
                                    </h3>
                                    {primaryGuild.botAdded ? (
                                        <p className='text-xs text-lucky-success mt-1 inline-block'>
                                            Lucky installed
                                        </p>
                                    ) : (
                                        <p className='text-xs text-lucky-text-tertiary mt-1'>
                                            Invite Lucky
                                        </p>
                                    )}
                                </div>
                                <ExternalLink className='h-4 w-4 text-lucky-text-tertiary flex-shrink-0 mt-1' />
                            </div>
                        </button>
                    </section>
                )}

                {secondaryGuilds.length > 0 && (
                    <section className='space-y-3'>
                        <h2 className='text-xs uppercase tracking-wider font-semibold text-lucky-text-tertiary'>
                            All Other Servers
                        </h2>
                        <ServerGrid />
                    </section>
                )}

                {guilds.length === 0 && (
                    <div className='surface-panel rounded-lg p-12 text-center border border-lucky-border'>
                        <div className='w-12 h-12 rounded-full bg-lucky-bg-tertiary mx-auto mb-4 flex items-center justify-center'>
                            <LayoutGrid className='h-6 w-6 text-lucky-text-tertiary' />
                        </div>
                        <p className='text-lucky-text-primary font-medium mb-2'>
                            No servers yet
                        </p>
                        <p className='text-sm text-lucky-text-secondary'>
                            Join a Discord server and Lucky will appear here.
                        </p>
                    </div>
                )}
            </div>
        </main>
    )
}
