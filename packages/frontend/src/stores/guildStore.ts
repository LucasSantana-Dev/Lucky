import { create } from 'zustand'
import type { Guild, ServerSettings, ServerListing } from '@/types'
import { api } from '@/services/api'

interface GuildState {
    guilds: Guild[]
    selectedGuild: Guild | null
    selectedGuildId: string | null
    isLoading: boolean
    serverSettings: ServerSettings | null
    serverListing: ServerListing | null
    fetchGuilds: () => Promise<void>
    selectGuild: (guild: Guild | null) => void
    setSelectedGuild: (guildId: string | null) => void
    getSelectedGuild: () => Guild | null
    updateServerSettings: (settings: Partial<ServerSettings>) => void
    updateServerListing: (listing: Partial<ServerListing>) => void
}

export const useGuildStore = create<GuildState>((set, get) => ({
    guilds: [],
    selectedGuild: null,
    selectedGuildId: null,
    isLoading: false,
    serverSettings: null,
    serverListing: null,

    fetchGuilds: async () => {
        set({ isLoading: true })
        try {
            const response = await api.guilds.list()
            const guilds = response.data.guilds
            set({ guilds, isLoading: false })
            if (guilds.length > 0 && !get().selectedGuild) {
                const firstBotGuild = guilds.find((g) => g.botAdded)
                if (firstBotGuild) {
                    get().selectGuild(firstBotGuild)
                }
            }
        } catch {
            set({ guilds: [], isLoading: false })
        }
    },

    selectGuild: (guild) => {
        set({
            selectedGuild: guild,
            selectedGuildId: guild?.id || null,
            serverSettings: guild ? null : null,
            serverListing: guild ? null : null,
        })
        if (guild) {
            api.guilds
                .getSettings(guild.id)
                .then((response) => {
                    set({ serverSettings: response.data.settings })
                })
                .catch(() => {
                    set({ serverSettings: null })
                })
            api.guilds
                .getListing(guild.id)
                .then((response) => {
                    set({ serverListing: response.data.listing })
                })
                .catch(() => {
                    set({ serverListing: null })
                })
        }
    },

    setSelectedGuild: (guildId) => {
        const guild = get().guilds.find((g) => g.id === guildId) || null
        get().selectGuild(guild)
    },

    getSelectedGuild: () => get().selectedGuild,

    updateServerSettings: (settings) => {
        const current = get().serverSettings
        if (current) {
            set({ serverSettings: { ...current, ...settings } })
        }
    },

    updateServerListing: (listing) => {
        const current = get().serverListing
        if (current) {
            set({ serverListing: { ...current, ...listing } })
        }
    },
}))
