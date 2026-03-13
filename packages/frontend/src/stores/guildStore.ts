import { create } from 'zustand'
import type {
    Guild,
    GuildMemberContext,
    ServerSettings,
    ServerListing,
} from '@/types'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'

export type GuildLoadErrorKind =
    | 'auth'
    | 'forbidden'
    | 'network'
    | 'upstream'

export interface GuildLoadErrorState {
    kind: GuildLoadErrorKind
    message: string
    status?: number
}

interface GuildState {
    guilds: Guild[]
    selectedGuild: Guild | null
    selectedGuildId: string | null
    isLoading: boolean
    hasFetchedGuilds: boolean
    guildLoadError: GuildLoadErrorState | null
    memberContext: GuildMemberContext | null
    memberContextLoading: boolean
    serverSettings: ServerSettings | null
    serverListing: ServerListing | null
    fetchGuilds: (force?: boolean) => Promise<void>
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

function classifyGuildLoadError(error: unknown): GuildLoadErrorState {
    if (error instanceof ApiError) {
        if (error.status === 401) {
            return { kind: 'auth', message: error.message, status: error.status }
        }

        if (error.status === 403) {
            return {
                kind: 'forbidden',
                message: error.message,
                status: error.status,
            }
        }

        if (error.status === 0) {
            return {
                kind: 'network',
                message: error.message,
                status: error.status,
            }
        }

        return { kind: 'upstream', message: error.message, status: error.status }
    }

    if (error instanceof Error) {
        return { kind: 'upstream', message: error.message }
    }

    return { kind: 'upstream', message: 'Unable to load servers' }
}

let guildFetchPromise: Promise<void> | null = null

export const useGuildStore = create<GuildState>((set, get) => ({
    guilds: [],
    selectedGuild: null,
    selectedGuildId: null,
    isLoading: false,
    hasFetchedGuilds: false,
    guildLoadError: null,
    memberContext: null,
    memberContextLoading: false,
    serverSettings: null,
    serverListing: null,

    fetchGuilds: async (force = false) => {
        if (get().isLoading && guildFetchPromise) {
            await guildFetchPromise
            return
        }

        if (!force && get().hasFetchedGuilds) {
            return
        }

        set({ isLoading: true, guildLoadError: null })

        const run = (async () => {
            try {
                const response = await api.guilds.list()
                const guilds = response.data.guilds
                set({ guilds, isLoading: false, hasFetchedGuilds: true })

                const { selectedGuildId, selectedGuild } = get()
                if (selectedGuildId) {
                    const refreshedSelectedGuild =
                        guilds.find((guild) => guild.id === selectedGuildId) ??
                        null

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
                    const firstWithBot =
                        guilds.find((guild) => guild.botAdded) ?? guilds[0]
                    get().selectGuild(firstWithBot)
                }
            } catch (error) {
                set((state) => ({
                    guilds: state.guilds,
                    selectedGuild: state.selectedGuild,
                    selectedGuildId: state.selectedGuildId,
                    memberContext: state.memberContext,
                    memberContextLoading: false,
                    serverSettings: state.serverSettings,
                    serverListing: state.serverListing,
                    guildLoadError: classifyGuildLoadError(error),
                    isLoading: false,
                    hasFetchedGuilds: true,
                }))
            }
        })()

        guildFetchPromise = run
        try {
            await run
        } finally {
            if (guildFetchPromise === run) {
                guildFetchPromise = null
            }
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
