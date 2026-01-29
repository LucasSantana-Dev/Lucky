import axios, { AxiosInstance } from 'axios'
import type {
    User,
    Guild,
    Module,
    Command,
    ActivityLog,
    LogEntry,
    LogCategory,
    ServerSettings,
    ServerListing,
    Feature,
    FeatureToggleState,
} from '@/types'

const API_BASE = '/api'

interface BackendGuild {
    id: string
    name: string
    icon: string | null
    owner: boolean
    permissions: string
    features: string[]
    hasBot: boolean
    botInviteUrl?: string
    memberCount?: number
    categoryCount?: number
    textChannelCount?: number
    voiceChannelCount?: number
    roleCount?: number
}

const mapGuild = (backendGuild: BackendGuild): Guild => {
    const { hasBot, ...rest } = backendGuild
    return {
        ...rest,
        botAdded: hasBot,
    }
}

const apiClient: AxiosInstance = axios.create({
    baseURL: API_BASE,
    withCredentials: true,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
})

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status
        const errorMessage =
            error.response?.data?.error || error.message || 'An error occurred'

        if (status === 401) {
            window.location.href = `${API_BASE}/auth/discord`
            return Promise.reject(new Error('Unauthorized'))
        }

        if (status === 403) {
            console.warn('Forbidden:', errorMessage)
            return Promise.reject(new Error('Forbidden: ' + errorMessage))
        }

        if (status === 404) {
            console.warn('Not found:', errorMessage)
            return Promise.reject(new Error('Not found: ' + errorMessage))
        }

        if (!error.response) {
            console.error('Network error:', errorMessage)
            return Promise.reject(
                new Error('Network error: Unable to connect to the server'),
            )
        }

        console.error('API Error:', errorMessage, error)
        return Promise.reject(new Error(errorMessage))
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
        getDiscordLoginUrl: () => `${API_BASE}/auth/discord`,
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

    logs: {
        getActivity: (guildId: string) =>
            apiClient.get<{ logs: ActivityLog[] }>(
                `/guilds/${guildId}/logs/activity`,
            ),
        getByCategory: (guildId: string, category: LogCategory) =>
            apiClient.get<{ logs: LogEntry[] }>(
                `/guilds/${guildId}/logs/${category.toLowerCase()}`,
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
}

export default apiClient
