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
            <div
                className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                role='status'
                aria-label='Loading servers'
            >
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className='surface-card p-5 space-y-4'
                    >
                        <div className='flex items-center gap-4'>
                            <Skeleton className='w-14 h-14 rounded-full' />
                            <div className='flex-1 space-y-2'>
                                <Skeleton className='h-4 w-3/4' />
                                <Skeleton className='h-3 w-1/2' />
                            </div>
                        </div>
                        <Skeleton className='h-9 w-full rounded-lg' />
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
                                    'px-4 py-1.5 rounded-lg transition-all duration-150 type-body-sm font-medium',
                                    filter === filterType
                                        ? 'bg-lucky-brand text-white shadow-sm'
                                        : 'bg-lucky-bg-secondary text-lucky-text-secondary border border-lucky-border hover:border-lucky-border-strong hover:text-lucky-text-primary',
                                )}
                                aria-pressed={filter === filterType}
                            >
                                {filterType === 'all'
                                    ? 'All Servers'
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
                <div
                    className='type-body text-lucky-text-secondary text-center py-12'
                    role='status'
                >
                    No servers found matching the filter.
                </div>
            )}
        </div>
    )
}
