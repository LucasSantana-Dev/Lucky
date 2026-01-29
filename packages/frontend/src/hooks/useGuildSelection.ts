import { useEffect } from 'react'
import { useGuildStore } from '@/stores/guildStore'

export function useGuildSelection() {
    const guilds = useGuildStore((state) => state.guilds)
    const selectedGuild = useGuildStore((state) => state.selectedGuild)
    const selectGuild = useGuildStore((state) => state.selectGuild)
    const fetchGuilds = useGuildStore((state) => state.fetchGuilds)

    useEffect(() => {
        fetchGuilds()
    }, [fetchGuilds])

    useEffect(() => {
        if (!selectedGuild && guilds.length > 0) {
            const firstWithBot = guilds.find((g) => g.botAdded)
            if (firstWithBot) {
                selectGuild(firstWithBot)
            }
        }
    }, [guilds, selectedGuild, selectGuild])

    return {
        guilds,
        selectedGuild,
        selectGuild,
    }
}
