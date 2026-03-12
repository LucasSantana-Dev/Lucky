import { useEffect, useRef } from 'react'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'

export function useGuildSelection() {
    const guilds = useGuildStore((state) => state.guilds)
    const selectedGuild = useGuildStore((state) => state.selectedGuild)
    const guildLoadError = useGuildStore((state) => state.guildLoadError)
    const selectGuild = useGuildStore((state) => state.selectGuild)
    const fetchGuilds = useGuildStore((state) => state.fetchGuilds)
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const authLoading = useAuthStore((state) => state.isLoading)
    const hasRetriedAuthReadyFetch = useRef(false)

    useEffect(() => {
        if (!isAuthenticated || authLoading) {
            return
        }

        fetchGuilds()
    }, [fetchGuilds, isAuthenticated, authLoading])

    useEffect(() => {
        if (!isAuthenticated || authLoading) {
            return
        }

        if (hasRetriedAuthReadyFetch.current) {
            return
        }

        if (
            guildLoadError?.kind !== 'auth' &&
            guildLoadError?.kind !== 'forbidden'
        ) {
            return
        }

        hasRetriedAuthReadyFetch.current = true
        fetchGuilds()
    }, [authLoading, fetchGuilds, guildLoadError, isAuthenticated])

    useEffect(() => {
        if (!selectedGuild && guilds.length > 0) {
            const firstWithBot = guilds.find((g) => g.botAdded)
            if (firstWithBot) {
                selectGuild(firstWithBot)
            }
        }
    }, [guilds, selectedGuild, selectGuild])

    useEffect(() => {
        if (!isAuthenticated) {
            hasRetriedAuthReadyFetch.current = false
        }
    }, [isAuthenticated])

    return {
        guilds,
        selectedGuild,
        selectGuild,
    }
}
