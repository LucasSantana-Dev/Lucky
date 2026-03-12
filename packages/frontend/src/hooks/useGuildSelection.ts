import { useEffect } from 'react'
import { useGuildStore } from '@/stores/guildStore'

export function useGuildSelection() {
    const guilds = useGuildStore((state) => state.guilds)
    const selectedGuild = useGuildStore((state) => state.selectedGuild)
    const isLoading = useGuildStore((state) => state.isLoading)
    const hasFetchedGuilds = useGuildStore((state) => state.hasFetchedGuilds)
    const selectGuild = useGuildStore((state) => state.selectGuild)
    const fetchGuilds = useGuildStore((state) => state.fetchGuilds)

    useEffect(() => {
        if (
            guilds.length > 0 ||
            selectedGuild ||
            isLoading ||
            hasFetchedGuilds
        ) {
            return
        }
        fetchGuilds()
    }, [fetchGuilds, guilds.length, selectedGuild, isLoading, hasFetchedGuilds])

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
