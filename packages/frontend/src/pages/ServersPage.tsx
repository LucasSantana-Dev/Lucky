import { Crown, LayoutGrid, Settings, ShieldCheck } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import ActionPanel from '@/components/ui/ActionPanel'
import ServerGrid from '@/components/Dashboard/ServerGrid'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function ServersPage() {
    const guilds = useGuildStore((state) => state.guilds)
    const isLoading = useGuildStore((state) => state.isLoading)
    const user = useAuthStore((state) => state.user)

    usePageMetadata({
        title: 'Servers - Lucky',
        description: 'View and manage your Discord servers',
    })

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
                    <AvatarFallback className='bg-lucky-red text-xl text-white'>
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

                <div className='ml-auto rounded-xl border border-lucky-border bg-lucky-bg-tertiary/70 px-4 py-2'>
                    <p className='type-meta text-lucky-text-tertiary'>
                        Managed servers
                    </p>
                    <p className='type-title text-lucky-text-primary'>
                        {guilds.length}
                    </p>
                </div>
            </div>

            <SectionHeader
                eyebrow='Guild management'
                title='Servers'
                description={`Servers you're in (${guilds.length} servers)`}
            />

            <nav
                className='flex flex-wrap gap-2'
                aria-label='Server navigation'
            >
                <button className='type-body-sm inline-flex items-center gap-2 rounded-xl border border-lucky-border-strong bg-lucky-bg-active px-4 py-2 text-lucky-text-primary'>
                    <LayoutGrid className='h-4 w-4' aria-hidden='true' />
                    Servers
                </button>
                <button
                    className='type-body-sm inline-flex items-center gap-2 rounded-xl border border-lucky-border bg-lucky-bg-secondary px-4 py-2 text-lucky-text-secondary transition-colors hover:text-lucky-text-primary'
                    aria-label='Premium features'
                >
                    <Crown className='h-4 w-4' aria-hidden='true' />
                    Premium
                </button>
                <button
                    className='type-body-sm inline-flex items-center gap-2 rounded-xl border border-lucky-border bg-lucky-bg-secondary px-4 py-2 text-lucky-text-secondary transition-colors hover:text-lucky-text-primary'
                    aria-label='Settings'
                >
                    <Settings className='h-4 w-4' aria-hidden='true' />
                    Settings
                </button>
            </nav>

            <div className='grid gap-4 lg:grid-cols-2'>
                <ActionPanel
                    title='Bot Status'
                    description='Review where Lucky is already installed and ready.'
                    icon={<ShieldCheck className='h-4 w-4' />}
                />
                <ActionPanel
                    title='Server Discovery'
                    description='Use cards below to invite Lucky to missing servers.'
                    icon={<LayoutGrid className='h-4 w-4' />}
                />
            </div>

            <section aria-labelledby='servers-heading' className='space-y-4'>
                <h2
                    id='servers-heading'
                    className='type-title text-lucky-text-primary'
                >
                    Servers
                </h2>
                <ServerGrid />
            </section>
        </main>
    )
}
