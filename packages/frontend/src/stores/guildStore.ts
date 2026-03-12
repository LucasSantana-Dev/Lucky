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

interface GuildState {
    guilds: Guild[]
    selectedGuild: Guild | null
    selectedGuildId: string | null
    currentGuildRequestId: number
    currentGuildSelectionRequestId: number
    isLoading: boolean
    guildLoadError: GuildLoadErrorState | null
    memberContext: GuildMemberContext | null
    memberContextLoading: boolean
    serverSettings: ServerSettings | null
    serverListing: ServerListing | null
    fetchGuilds: () => Promise<void>
    selectGuild: (guild: Guild | null) => void
    fetchMemberContext: (guildId: string, requestId?: number) => Promise<void>
    setSelectedGuild: (guildId: string | null) => void
    getSelectedGuild: () => Guild | null
    updateServerSettings: (settings: Partial<ServerSettings>) => void
    updateServerListing: (listing: Partial<ServerListing>) => void
}

export const useGuildStore = create<GuildState>((set, get) => ({
    guilds: [],
    selectedGuild: null,
    selectedGuildId: null,
    currentGuildRequestId: 0,
    currentGuildSelectionRequestId: 0,
    isLoading: false,
    guildLoadError: null,
    memberContext: null,
    memberContextLoading: false,
    serverSettings: null,
    serverListing: null,

    fetchGuilds: async () => {
        const requestId = get().currentGuildRequestId + 1
        set({
            isLoading: true,
            guildLoadError: null,
            currentGuildRequestId: requestId,
        })
        try {
            const response = await api.guilds.list()
            if (requestId !== get().currentGuildRequestId) {
                return
            }

            const guilds = response.data.guilds
            const currentSelectedGuildId = get().selectedGuildId
            const nextSelectedGuild = currentSelectedGuildId
                ? guilds.find((guild) => guild.id === currentSelectedGuildId) ??
                  null
                : null

            set({
                guilds,
                isLoading: false,
                guildLoadError: null,
                selectedGuild: nextSelectedGuild,
                selectedGuildId: nextSelectedGuild?.id ?? null,
            })

            if (nextSelectedGuild) {
                return
            }

            set({
                memberContext: null,
                memberContextLoading: false,
                serverSettings: null,
                serverListing: null,
            })

            const firstWithBot = guilds.find((guild) => guild.botAdded)
            if (firstWithBot) {
                get().selectGuild(firstWithBot)
            }
        } catch (error) {
            if (requestId !== get().currentGuildRequestId) {
                return
            }
            set({
                guilds: [],
                selectedGuild: null,
                selectedGuildId: null,
                memberContext: null,
                memberContextLoading: false,
                serverSettings: null,
                serverListing: null,
                guildLoadError: classifyGuildLoadError(error),
                isLoading: false,
            })
        }
    },

    selectGuild: (guild) => {
        const requestId = get().currentGuildSelectionRequestId + 1
        set({
            selectedGuild: guild,
            selectedGuildId: guild?.id || null,
            memberContext: null,
            memberContextLoading: Boolean(guild),
            serverSettings: null,
            serverListing: null,
            currentGuildSelectionRequestId: requestId,
        })
        if (guild) {
            void get().fetchMemberContext(guild.id, requestId)
            api.guilds
                .getSettings(guild.id)
                .then((response) => {
                    if (requestId !== get().currentGuildSelectionRequestId) {
                        return
                    }
                    set({ serverSettings: response.data.settings })
                })
                .catch((error) => {
                    if (requestId !== get().currentGuildSelectionRequestId) {
                        return
                    }
                    console.error('Failed to load server settings', {
                        guildId: guild.id,
                        requestId,
                        error,
                    })
                    set({ serverSettings: null })
                })
            api.guilds
                .getListing(guild.id)
                .then((response) => {
                    if (requestId !== get().currentGuildSelectionRequestId) {
                        return
                    }
                    set({ serverListing: response.data.listing })
                })
                .catch((error) => {
                    if (requestId !== get().currentGuildSelectionRequestId) {
                        return
                    }
                    console.error('Failed to load server listing', {
                        guildId: guild.id,
                        requestId,
                        error,
                    })
                    set({ serverListing: null })
                })
        }
    },

    fetchMemberContext: async (guildId, requestId) => {
        const activeRequestId =
            requestId ?? get().currentGuildSelectionRequestId
        set({ memberContextLoading: true })
        try {
            const response = await api.guilds.getMe(guildId)
            if (activeRequestId !== get().currentGuildSelectionRequestId) {
                return
            }
            set({
                memberContext: response.data,
                memberContextLoading: false,
            })
        } catch (error) {
            if (activeRequestId !== get().currentGuildSelectionRequestId) {
                return
            }
            console.error('Failed to load guild member context', {
                guildId,
                requestId: activeRequestId,
                error,
            })
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
