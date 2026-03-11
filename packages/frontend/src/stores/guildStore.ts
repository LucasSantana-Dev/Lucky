import { create } from 'zustand'
import type {
    Guild,
    GuildMemberContext,
    ServerSettings,
    ServerListing,
} from '@/types'
import { api } from '@/services/api'

interface GuildState {
    guilds: Guild[]
    selectedGuild: Guild | null
    selectedGuildId: string | null
    isLoading: boolean
    memberContext: GuildMemberContext | null
    memberContextLoading: boolean
    serverSettings: ServerSettings | null
    serverListing: ServerListing | null
    fetchGuilds: () => Promise<void>
    selectGuild: (guild: Guild | null) => void
    fetchMemberContext: (guildId: string) => Promise<void>
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
    memberContext: null,
    memberContextLoading: false,
    serverSettings: null,
    serverListing: null,

    fetchGuilds: async () => {
        set({ isLoading: true })
        try {
            const response = await api.guilds.list()
            const guilds = response.data.guilds
            const selectedGuildId = get().selectedGuildId

            set({ guilds, isLoading: false })

            const targetGuildId =
                selectedGuildId &&
                guilds.some((guild) => guild.id === selectedGuildId)
                    ? selectedGuildId
                    : (guilds[0]?.id ?? null)

            if (targetGuildId) {
                get().setSelectedGuild(targetGuildId)
            } else {
                set({
                    selectedGuild: null,
                    selectedGuildId: null,
                    memberContext: null,
                    memberContextLoading: false,
                    serverSettings: null,
                    serverListing: null,
                })
            }
        } catch {
            set({ guilds: [], isLoading: false })
        }
    },

    selectGuild: (guild) => {
        set({
            selectedGuild: guild,
            selectedGuildId: guild?.id || null,
            memberContext: null,
            memberContextLoading: Boolean(guild),
            serverSettings: null,
            serverListing: null,
        })
        if (guild) {
            api.guilds
                .get(guild.id)
                .then((response) => {
                    const refreshedGuild = response.data.guild
                    set((state) => ({
                        guilds: state.guilds.map((item) =>
                            item.id === refreshedGuild.id
                                ? {
                                      ...item,
                                      ...refreshedGuild,
                                  }
                                : item,
                        ),
                        selectedGuild:
                            state.selectedGuild?.id === refreshedGuild.id
                                ? {
                                      ...state.selectedGuild,
                                      ...refreshedGuild,
                                  }
                                : state.selectedGuild,
                    }))
                })
                .catch(() => {})
            get()
                .fetchMemberContext(guild.id)
                .catch(() => {})
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

    fetchMemberContext: async (guildId) => {
        set({ memberContextLoading: true })
        try {
            const response = await api.guilds.getMe(guildId)
            set({
                memberContext: response.data,
                memberContextLoading: false,
            })
        } catch {
            set({
                memberContext: null,
                memberContextLoading: false,
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
