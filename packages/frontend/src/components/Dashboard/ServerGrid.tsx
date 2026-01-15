import { useState } from 'react'
import { useGuildStore } from '@/stores/guildStore'
import ServerCard from './ServerCard'
import Skeleton from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'with-bot' | 'without-bot'

export default function ServerGrid() {
    const { guilds, isLoading } = useGuildStore()
    const [filter, setFilter] = useState<FilterType>('all')

    const filteredGuilds = guilds.filter((guild) => {
        if (filter === 'with-bot') return guild.botAdded
        if (filter === 'without-bot') return !guild.botAdded
        return true
    })

    if (isLoading) {
        return (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className='bg-lukbot-bg-secondary border border-lukbot-border rounded-lg p-6 space-y-4'
                    >
                        <div className='flex items-center gap-4'>
                            <Skeleton className='w-16 h-16 rounded-full' />
                            <div className='flex-1 space-y-2'>
                                <Skeleton className='h-4 w-3/4' />
                                <Skeleton className='h-3 w-1/2' />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex gap-2'>
                {(['all', 'with-bot', 'without-bot'] as FilterType[]).map(
                    (filterType) => (
                        <button
                            key={filterType}
                            onClick={() => setFilter(filterType)}
                            className={cn(
                                'px-4 py-2 rounded-lg transition-colors text-sm font-medium',
                                filter === filterType
                                    ? 'bg-lukbot-red text-white'
                                    : 'bg-lukbot-bg-secondary text-lukbot-text-secondary hover:bg-lukbot-bg-tertiary hover:text-white',
                            )}
                        >
                            {filterType === 'all'
                                ? 'All'
                                : filterType === 'with-bot'
                                  ? 'With Bot'
                                  : 'Without Bot'}
                        </button>
                    ),
                )}
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {filteredGuilds.map((guild) => (
                    <ServerCard key={guild.id} guild={guild} />
                ))}
            </div>
            {filteredGuilds.length === 0 && (
                <div className='text-center text-lukbot-text-secondary py-12'>
                    No servers found matching the filter.
                </div>
            )}
        </div>
    )
}
