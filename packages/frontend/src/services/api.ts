import axios, { AxiosInstance } from 'axios'
import type {
    User,
    Guild,
    Module,
    Command,
    ServerSettings,
    ServerListing,
    Feature,
    FeatureToggleState,
    GuildMemberContext,
    GuildRoleOption,
    RoleGrant,
    ModuleKey,
} from '@/types'
import { ApiError } from './ApiError'
import { createMusicApi } from './musicApi'
import { createModerationApi } from './moderationApi'
import { createAutoModApi } from './automodApi'
import { createLogsApi } from './logsApi'
import { inferApiBase } from './apiBase'

const browserLocation =
    typeof globalThis !== 'undefined' && 'window' in globalThis
        ? globalThis.window.location
        : undefined

function removeTrailingSlashes(value: string): string {
    let result = value
    while (result.length > 1 && result.endsWith('/')) {
        result = result.slice(0, -1)
    }
    return result
}

const API_BASE = inferApiBase(
    import.meta.env.VITE_API_BASE_URL,
    browserLocation,
)

const NORMALIZED_API_BASE = removeTrailingSlashes(API_BASE)

interface BackendGuild {
    id: string
    name: string
    icon: string | null
    owner: boolean
    permissions: string
    features: string[]
    hasBot: boolean
    botInviteUrl?: string
    memberCount?: number | null
    categoryCount?: number | null
    textChannelCount?: number | null
    voiceChannelCount?: number | null
    roleCount?: number | null
    effectiveAccess?: Guild['effectiveAccess']
    canManageRbac?: boolean
}

const mapGuild = (backendGuild: BackendGuild): Guild => {
    const { hasBot, ...rest } = backendGuild
    return {
        ...rest,
        botAdded: hasBot,
    }
}

const apiClient: AxiosInstance = axios.create({
    baseURL: NORMALIZED_API_BASE,
    withCredentials: true,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
})

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (!error.response) {
            return Promise.reject(
                new ApiError(0, 'Unable to connect to the server'),
            )
        }

        const status: number = error.response.status
        const data = error.response.data as
            | { error?: string; details?: unknown }
            | undefined
        const message = data?.error || error.message || 'An error occurred'

        if (
            status === 401 &&
            typeof globalThis !== 'undefined' &&
            'window' in globalThis
        ) {
            globalThis.window.location.assign('/api/auth/discord')
        }

        return Promise.reject(new ApiError(status, message, data?.details))
    },
)

export const api = {
    auth: {
        checkStatus: () =>
            apiClient.get<{ authenticated: boolean; user?: User }>(
                '/auth/status',
            ),
        getUser: async () => {
            const response = await apiClient.get<User>('/auth/user')
            return {
                ...response,
                data: {
                    user: response.data,
                },
            }
        },
        logout: () => apiClient.get<{ success: boolean }>('/auth/logout'),
        getDiscordLoginUrl: () => `${NORMALIZED_API_BASE}/auth/discord`,
    },

    guilds: {
        list: async () => {
            const response = await apiClient.get<{ guilds: BackendGuild[] }>(
                '/guilds',
            )
            return {
                ...response,
                data: {
                    guilds: response.data.guilds.map(mapGuild),
                },
            }
        },
        get: async (id: string) => {
            const response = await apiClient.get<BackendGuild>(`/guilds/${id}`)
            return {
                ...response,
                data: {
                    guild: mapGuild(response.data),
                },
            }
        },
        getInvite: (id: string) =>
            apiClient.get<{ inviteUrl: string }>(`/guilds/${id}/invite`),
        getMe: (id: string) =>
            apiClient.get<GuildMemberContext>(`/guilds/${id}/me`),
        getRbac: (id: string) =>
            apiClient.get<{
                guildId: string
                modules: ModuleKey[]
                grants: RoleGrant[]
                roles: GuildRoleOption[]
                effectiveAccess: NonNullable<Guild['effectiveAccess']>
                canManageRbac: boolean
            }>(`/guilds/${id}/rbac`),
        updateRbac: (id: string, grants: RoleGrant[]) =>
            apiClient.put<{ success: boolean; grants: RoleGrant[] }>(
                `/guilds/${id}/rbac`,
                { grants },
            ),
        getSettings: (id: string) =>
            apiClient.get<{ settings: ServerSettings }>(
                `/guilds/${id}/settings`,
            ),
        updateSettings: (id: string, settings: Partial<ServerSettings>) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${id}/settings`,
                settings,
            ),
        getListing: (id: string) =>
            apiClient.get<{ listing: ServerListing }>(`/guilds/${id}/listing`),
        updateListing: (id: string, listing: Partial<ServerListing>) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${id}/listing`,
                listing,
            ),
    },

    modules: {
        list: (guildId: string) =>
            apiClient.get<{ modules: Module[] }>(`/guilds/${guildId}/modules`),
        get: (guildId: string, moduleSlug: string) =>
            apiClient.get<{ module: Module }>(
                `/guilds/${guildId}/modules/${moduleSlug}`,
            ),
        toggle: (guildId: string, moduleId: string, enabled: boolean) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/modules/${moduleId}/toggle`,
                { enabled },
            ),
        getSettings: (guildId: string, moduleSlug: string) =>
            apiClient.get<{ settings: Record<string, unknown> }>(
                `/guilds/${guildId}/modules/${moduleSlug}/settings`,
            ),
        updateSettings: (
            guildId: string,
            moduleSlug: string,
            settings: Record<string, unknown>,
        ) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/modules/${moduleSlug}/settings`,
                settings,
            ),
    },

    commands: {
        list: (guildId: string) =>
            apiClient.get<{ commands: Command[] }>(
                `/guilds/${guildId}/commands`,
            ),
        toggle: (guildId: string, commandId: string, enabled: boolean) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/commands/${commandId}/toggle`,
                { enabled },
            ),
        getSettings: (guildId: string, commandId: string) =>
            apiClient.get<{ settings: Record<string, unknown> }>(
                `/guilds/${guildId}/commands/${commandId}/settings`,
            ),
        updateSettings: (
            guildId: string,
            commandId: string,
            settings: Record<string, unknown>,
        ) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/commands/${commandId}/settings`,
                settings,
            ),
    },

    features: {
        list: async () => {
            const response = await apiClient.get<{
                features: Array<{ name: string; description: string }>
            }>('/features')
            return {
                ...response,
                data: {
                    features: response.data.features.map((f) => ({
                        ...f,
                        isGlobal: false,
                    })) as Feature[],
                },
            }
        },
        getGlobalToggles: () =>
            apiClient.get<{ toggles: FeatureToggleState }>('/toggles/global'),
        updateGlobalToggle: (name: string, enabled: boolean) =>
            apiClient.post<{
                success: boolean
                message?: string
                note?: string
            }>(`/toggles/global/${name}`, {
                enabled,
            }),
        getServerToggles: async (guildId: string) => {
            const response = await apiClient.get<{
                guildId: string
                toggles: FeatureToggleState
            }>(`/guilds/${guildId}/features`)
            return {
                ...response,
                data: {
                    toggles: response.data.toggles,
                },
            }
        },
        updateServerToggle: (guildId: string, name: string, enabled: boolean) =>
            apiClient.post<{
                success: boolean
                message?: string
                note?: string
            }>(`/guilds/${guildId}/features/${name}`, { enabled }),
    },

    trackHistory: {
        getHistory: (guildId: string, limit = 10) =>
            apiClient.get<{
                history: Array<{
                    trackId: string
                    title: string
                    author: string
                    duration: string
                    url: string
                    timestamp: number
                    playedBy?: string
                }>
            }>(`/guilds/${guildId}/music/history?limit=${limit}`),
        getStats: (guildId: string) =>
            apiClient.get<{
                stats: {
                    totalTracks: number
                    totalPlayTime: number
                    topArtists: Array<{ artist: string; plays: number }>
                    topTracks: Array<{
                        trackId: string
                        title: string
                        plays: number
                    }>
                    lastUpdated: string
                } | null
            }>(`/guilds/${guildId}/music/history/stats`),
        getTopTracks: (guildId: string, limit = 10) =>
            apiClient.get<{
                tracks: Array<{
                    trackId: string
                    title: string
                    plays: number
                }>
            }>(`/guilds/${guildId}/music/history/top-tracks?limit=${limit}`),
        getTopArtists: (guildId: string, limit = 10) =>
            apiClient.get<{
                artists: Array<{ artist: string; plays: number }>
            }>(`/guilds/${guildId}/music/history/top-artists?limit=${limit}`),
        clearHistory: (guildId: string) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/music/history`,
            ),
    },

    twitch: {
        list: (guildId: string) =>
            apiClient.get<{
                notifications: Array<{
                    id: string
                    guildId: string
                    twitchUserId: string
                    twitchLogin: string
                    discordChannelId: string
                }>
            }>(`/guilds/${guildId}/twitch/notifications`),
        add: (
            guildId: string,
            data: {
                twitchUserId: string
                twitchLogin: string
                discordChannelId: string
            },
        ) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/twitch/notifications`,
                data,
            ),
        remove: (guildId: string, twitchUserId: string) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/twitch/notifications`,
                { data: { twitchUserId } },
            ),
    },

    lastfm: {
        status: () =>
            apiClient.get<{
                configured: boolean
                linked: boolean
                username: string | null
            }>('/lastfm/status'),
        unlink: () => apiClient.delete<{ success: boolean }>('/lastfm/unlink'),
        getConnectUrl: () => `${NORMALIZED_API_BASE}/lastfm/connect`,
    },

    lyrics: {
        search: (title: string, artist?: string) => {
            const params = new URLSearchParams({ title })
            if (artist) params.set('artist', artist)
            return apiClient.get<{
                lyrics: string
                title: string
                artist: string
            }>(`/lyrics?${params.toString()}`)
        },
    },

    music: createMusicApi(apiClient),
    moderation: createModerationApi(apiClient),
    automod: createAutoModApi(apiClient),
    serverLogs: createLogsApi(apiClient),
}

export { ApiError } from './ApiError'
export default apiClient
