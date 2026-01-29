import { useState, useMemo } from 'react'
import type { Guild } from '@/types'

type FilterType = 'all' | 'with-bot' | 'without-bot'

export function useServerFilter(guilds: Guild[]) {
    const [filter, setFilter] = useState<FilterType>('all')

    const filteredGuilds = useMemo(() => {
        return guilds.filter((guild) => {
            if (filter === 'with-bot') return guild.botAdded
            if (filter === 'without-bot') return !guild.botAdded
            return true
        })
    }, [guilds, filter])

    return {
        filter,
        setFilter,
        filteredGuilds,
    }
}
