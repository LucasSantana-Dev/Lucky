import { useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Skeleton from '@/components/ui/Skeleton'
import ServerGrid from '@/components/Dashboard/ServerGrid'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'

export default function ServersPage() {
    const { guilds, isLoading, fetchGuilds } = useGuildStore()
    const { user } = useAuthStore()

    useEffect(() => {
        fetchGuilds()
    }, [fetchGuilds])

    if (isLoading) {
        return (
            <div className='min-h-screen bg-lukbot-bg-primary p-6 space-y-6'>
                <div className='max-w-6xl mx-auto'>
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
                </div>
            </div>
        )
    }

    return (
        <div className='min-h-screen bg-lukbot-bg-primary p-6'>
            <div className='max-w-6xl mx-auto space-y-6'>
                <div className='flex items-center gap-4'>
                    <Avatar className='w-16 h-16 border-2 border-lukbot-border'>
                        <AvatarImage src={user?.avatar || undefined} />
                        <AvatarFallback className='bg-lukbot-red text-white text-xl'>
                            {user?.username?.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <h1 className='text-2xl font-bold text-white'>
                            {user?.username}
                        </h1>
                        <p className='text-lukbot-text-secondary'>
                            @{user?.username}
                        </p>
                    </div>
                </div>

                <div className='flex border-b border-lukbot-border'>
                    <button className='px-6 py-3 text-sm font-medium border-b-2 border-lukbot-red text-white'>
                        ☰ Servers
                    </button>
                    <button className='px-6 py-3 text-sm font-medium text-lukbot-text-secondary hover:text-white'>
                        ⭐ Premium
                    </button>
                    <button className='px-6 py-3 text-sm font-medium text-lukbot-text-secondary hover:text-white'>
                        ⚙ Settings
                    </button>
                </div>

                <div>
                    <div className='mb-4'>
                        <h2 className='text-xl font-bold text-white'>
                            Servers
                        </h2>
                        <p className='text-sm text-lukbot-text-secondary'>
                            Servers you're in ({guilds.length} servers)
                        </p>
                    </div>
                    <ServerGrid />
                </div>
            </div>
        </div>
    )
}
