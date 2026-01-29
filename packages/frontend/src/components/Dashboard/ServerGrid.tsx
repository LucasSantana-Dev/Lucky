import { useCallback } from 'react'
import { useGuildStore } from '@/stores/guildStore'
import ServerCard from './ServerCard'
import Skeleton from '@/components/ui/Skeleton'
import { useServerFilter } from '@/hooks/useServerFilter'
import { cn } from '@/lib/utils'

export default function ServerGrid() {
    const guilds = useGuildStore((state) => state.guilds)
    const isLoading = useGuildStore((state) => state.isLoading)
    const { filter, setFilter, filteredGuilds } = useServerFilter(guilds)

    const handleFilterChange = useCallback(
        (newFilter: typeof filter) => {
            setFilter(newFilter)
        },
        [setFilter],
    )

    if (isLoading) {
        return (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' role='status' aria-label='Loading servers'>
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
            <nav aria-label='Server filter'>
                <div className='flex gap-2'>
                    {(['all', 'with-bot', 'without-bot'] as const).map(
                        (filterType) => (
                            <button
                                key={filterType}
                                onClick={() => handleFilterChange(filterType)}
                                className={cn(
                                    'px-4 py-2 rounded-lg transition-colors text-sm font-medium',
                                    filter === filterType
                                        ? 'bg-lukbot-red text-white'
                                        : 'bg-lukbot-bg-secondary text-lukbot-text-secondary hover:bg-lukbot-bg-tertiary hover:text-white',
                                )}
                                aria-pressed={filter === filterType}
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
            </nav>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {filteredGuilds.map((guild) => (
                    <ServerCard key={guild.id} guild={guild} />
                ))}
            </div>
            {filteredGuilds.length === 0 && (
                <div className='text-center text-lukbot-text-secondary py-12' role='status'>
                    No servers found matching the filter.
                </div>
            )}
        </div>
    )
}
