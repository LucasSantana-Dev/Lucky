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
    hasFetchedGuilds: boolean
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

function mergeGuild(guilds: Guild[], incoming: Guild): Guild[] {
    return guilds.map((guild) =>
        guild.id === incoming.id ? { ...guild, ...incoming } : guild,
    )
}

export const useGuildStore = create<GuildState>((set, get) => ({
    guilds: [],
    selectedGuild: null,
    selectedGuildId: null,
    isLoading: false,
    hasFetchedGuilds: false,
    memberContext: null,
    memberContextLoading: false,
    serverSettings: null,
    serverListing: null,

    fetchGuilds: async () => {
        if (get().isLoading) {
            return
        }

        set({ isLoading: true })
        try {
            const response = await api.guilds.list()
            const guilds = response.data.guilds
            set({ guilds, isLoading: false, hasFetchedGuilds: true })

            const { selectedGuildId, selectedGuild } = get()
            if (selectedGuildId) {
                const refreshedSelectedGuild =
                    guilds.find((guild) => guild.id === selectedGuildId) ?? null

                if (refreshedSelectedGuild) {
                    get().selectGuild(refreshedSelectedGuild)
                    return
                }

                set({
                    selectedGuild: null,
                    selectedGuildId: null,
                    memberContext: null,
                    memberContextLoading: false,
                    serverSettings: null,
                    serverListing: null,
                })
            }

            if (guilds.length > 0 && !selectedGuild) {
                get().selectGuild(guilds[0])
            }
        } catch {
            set({ guilds: [], isLoading: false, hasFetchedGuilds: true })
        }
    },

    selectGuild: (guild) => {
        const guildId = guild?.id ?? null
        set({
            selectedGuild: guild,
            selectedGuildId: guildId,
            memberContext: null,
            memberContextLoading: Boolean(guild),
            serverSettings: null,
            serverListing: null,
        })

        if (!guildId) {
            return
        }

        const withCurrentGuild = <T extends object>(value: T): T | object => {
            return get().selectedGuildId === guildId ? value : {}
        }

        get()
            .fetchMemberContext(guildId)
            .catch(() => {})

        api.guilds
            .get(guildId)
            .then((response) => {
                set((state) => {
                    if (state.selectedGuildId !== guildId) {
                        return {}
                    }

                    const detailedGuild = response.data.guild
                    const mergedGuilds = mergeGuild(state.guilds, detailedGuild)
                    const selectedGuild =
                        mergedGuilds.find((item) => item.id === guildId) ??
                        detailedGuild

                    return {
                        guilds: mergedGuilds,
                        selectedGuild,
                    }
                })
            })
            .catch(() => {})

        api.guilds
            .getSettings(guildId)
            .then((response) => {
                set(
                    withCurrentGuild({
                        serverSettings: response.data.settings,
                    }),
                )
            })
            .catch(() => {
                set(withCurrentGuild({ serverSettings: null }))
            })

        api.guilds
            .getListing(guildId)
            .then((response) => {
                set(withCurrentGuild({ serverListing: response.data.listing }))
            })
            .catch(() => {
                set(withCurrentGuild({ serverListing: null }))
            })
    },

    fetchMemberContext: async (guildId) => {
        set((state) =>
            state.selectedGuildId === guildId
                ? { memberContextLoading: true }
                : {},
        )
        try {
            const response = await api.guilds.getMe(guildId)
            set((state) =>
                state.selectedGuildId === guildId
                    ? {
                          memberContext: response.data,
                          memberContextLoading: false,
                      }
                    : {},
            )
        } catch {
            set((state) =>
                state.selectedGuildId === guildId
                    ? {
                          memberContext: null,
                          memberContextLoading: false,
                      }
                    : {},
            )
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
