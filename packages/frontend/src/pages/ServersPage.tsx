import { Crown, LayoutGrid, Settings, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import ActionPanel from '@/components/ui/ActionPanel'
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
        description: 'View and manage your Discord servers',
    })

    const withBotCount = guilds.filter((g) => g.botAdded).length
    const withoutBotCount = guilds.length - withBotCount

    if (isLoading) {
        return (
            <main className='space-y-6'>
                <div className='surface-panel flex items-center gap-4 p-5'>
                    <Skeleton className='h-16 w-16 rounded-full' />
                    <div className='space-y-2'>
                        <Skeleton className='h-7 w-36' />
                        <Skeleton className='h-4 w-40' />
                    </div>
                </div>
                <div className='grid gap-4 lg:grid-cols-2'>
                    <div className='surface-panel p-5'>
                        <Skeleton className='mb-3 h-4 w-24' />
                        <Skeleton className='h-4 w-full' />
                    </div>
                    <div className='surface-panel p-5'>
                        <Skeleton className='mb-3 h-4 w-24' />
                        <Skeleton className='h-4 w-full' />
                    </div>
                </div>
                <ServerGrid />
            </main>
        )
    }

    return (
        <main className='space-y-6'>
            <div className='surface-panel flex flex-wrap items-center gap-4 p-5'>
                <Avatar className='h-16 w-16 border border-lucky-border'>
                    <AvatarImage
                        src={user?.avatar || undefined}
                        alt={user?.username || 'User avatar'}
                    />
                    <AvatarFallback className='bg-lucky-brand/20 type-h2 text-lucky-brand'>
                        {user?.username?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                <div className='space-y-1'>
                    <p className='type-meta text-lucky-text-tertiary'>
                        Discord profile
                    </p>
                    <p className='type-title text-lucky-text-primary'>
                        {user?.username}
                    </p>
                    <p className='type-body-sm text-lucky-text-secondary'>
                        @{user?.username}
                    </p>
                </div>

                <div className='ml-auto rounded-xl border border-lucky-border bg-lucky-bg-tertiary/70 px-4 py-2 text-center'>
                    <p className='type-meta text-lucky-text-tertiary'>
                        Total servers
                    </p>
                    <p className='type-h2 text-lucky-text-primary'>
                        {guilds.length}
                    </p>
                </div>
            </div>

            <SectionHeader
                eyebrow='Guild management'
                title='Servers'
                description={`${guilds.length} server${guilds.length !== 1 ? 's' : ''} — ${withBotCount} with Lucky installed`}
            />

            <nav
                className='flex flex-wrap gap-2'
                aria-label='Server navigation'
            >
                {(
                    [
                        { label: 'Servers', icon: <LayoutGrid className='h-4 w-4' />, active: true, onClick: undefined },
                        { label: 'Premium', icon: <Crown className='h-4 w-4' />, active: false, onClick: () => navigate('/features') },
                        { label: 'Settings', icon: <Settings className='h-4 w-4' />, active: false, onClick: () => navigate('/settings') },
                    ] as const
                ).map((tab) => (
                    <button
                        key={tab.label}
                        className={cn(
                            'type-body-sm inline-flex items-center gap-2 rounded-xl border px-4 py-2 transition-colors',
                            tab.active
                                ? 'border-lucky-border-strong bg-lucky-bg-active text-lucky-text-primary'
                                : 'border-lucky-border bg-lucky-bg-secondary text-lucky-text-secondary hover:text-lucky-text-primary hover:border-lucky-border-strong',
                        )}
                        aria-current={tab.active ? 'page' : undefined}
                        onClick={tab.onClick}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </nav>

            <div className='grid gap-4 lg:grid-cols-2'>
                <ActionPanel
                    title='Bot Installed'
                    description={
                        withBotCount === 0
                            ? 'Lucky is not installed in any of your servers yet.'
                            : `Lucky is active in ${withBotCount} of your ${guilds.length} server${guilds.length !== 1 ? 's' : ''}.`
                    }
                    icon={<ShieldCheck className='h-4 w-4' />}
                    action={
                        withBotCount > 0 ? (
                            <span className='type-body-sm rounded-lg bg-lucky-success/15 px-3 py-1 text-lucky-success'>
                                {withBotCount} active
                            </span>
                        ) : undefined
                    }
                />
                <ActionPanel
                    title='Invite Lucky'
                    description={
                        withoutBotCount === 0
                            ? 'Great — Lucky is installed in all your servers.'
                            : `${withoutBotCount} server${withoutBotCount !== 1 ? 's' : ''} ${withoutBotCount !== 1 ? 'are' : 'is'} missing Lucky.`
                    }
                    icon={<LayoutGrid className='h-4 w-4' />}
                    action={
                        withoutBotCount > 0 ? (
                            <a
                                href='#servers-heading'
                                className='type-body-sm rounded-lg border border-lucky-border px-3 py-1.5 text-lucky-text-secondary hover:text-lucky-text-primary transition-colors'
                            >
                                View servers
                            </a>
                        ) : undefined
                    }
                />
            </div>

            <section aria-labelledby='servers-heading' className='space-y-4'>
                <h2
                    id='servers-heading'
                    className='type-title text-lucky-text-primary'
                >
                    Your Servers
                </h2>
                <ServerGrid />
            </section>
        </main>
    )
}
