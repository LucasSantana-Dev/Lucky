import { useEffect } from 'react'
import { LayoutGrid, Crown, Settings } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Skeleton from '@/components/ui/Skeleton'
import ServerGrid from '@/components/Dashboard/ServerGrid'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function ServersPage() {
    const guilds = useGuildStore((state) => state.guilds)
    const isLoading = useGuildStore((state) => state.isLoading)
    const fetchGuilds = useGuildStore((state) => state.fetchGuilds)
    const user = useAuthStore((state) => state.user)
    usePageMetadata({
        title: 'Servers - Nexus',
        description: 'View and manage your Discord servers',
    })

    useEffect(() => {
        fetchGuilds()
    }, [fetchGuilds])

    if (isLoading) {
        return (
            <main className='space-y-6'>
                <div className='flex items-center gap-4'>
                    <Skeleton className='w-16 h-16 rounded-full' />
                    <div>
                        <Skeleton className='h-8 w-32 mb-2' />
                        <Skeleton className='h-4 w-24' />
                    </div>
                </div>
                <div className='mt-6'>
                    <ServerGrid />
                </div>
            </main>
        )
    }

    return (
        <main className='space-y-6'>
            <header className='flex items-center gap-4'>
                <Avatar className='w-16 h-16 border-2 border-nexus-border'>
                    <AvatarImage
                        src={user?.avatar || undefined}
                        alt={user?.username || 'User avatar'}
                    />
                    <AvatarFallback className='bg-nexus-red text-white text-xl'>
                        {user?.username?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h1 className='text-2xl font-bold text-white'>
                        {user?.username}
                    </h1>
                    <p className='text-nexus-text-secondary'>
                        @{user?.username}
                    </p>
                </div>
            </header>

            <nav
                className='flex border-b border-nexus-border'
                aria-label='Server navigation'
            >
                <button
                    className='flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 border-nexus-red text-white'
                    aria-current='page'
                >
                    <LayoutGrid className='w-4 h-4' aria-hidden='true' />
                    Servers
                </button>
                <button
                    className='flex items-center gap-2 px-6 py-3 text-sm font-medium text-nexus-text-secondary hover:text-white transition-colors'
                    aria-label='Premium features'
                >
                    <Crown className='w-4 h-4' aria-hidden='true' />
                    Premium
                </button>
                <button
                    className='flex items-center gap-2 px-6 py-3 text-sm font-medium text-nexus-text-secondary hover:text-white transition-colors'
                    aria-label='Settings'
                >
                    <Settings className='w-4 h-4' aria-hidden='true' />
                    Settings
                </button>
            </nav>

            <section aria-labelledby='servers-heading'>
                <div className='mb-4'>
                    <h2
                        id='servers-heading'
                        className='text-xl font-bold text-white'
                    >
                        Servers
                    </h2>
                    <p className='text-sm text-nexus-text-secondary'>
                        Servers you're in ({guilds.length} servers)
                    </p>
                </div>
                <ServerGrid />
            </section>
        </main>
    )
}
