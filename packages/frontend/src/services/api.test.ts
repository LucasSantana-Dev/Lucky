import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
    axiosCreateMock,
    inferApiBaseMock,
    createMusicApiMock,
    createModerationApiMock,
    createAutoModApiMock,
    createLogsApiMock,
} = vi.hoisted(() => ({
    axiosCreateMock: vi.fn(),
    inferApiBaseMock: vi.fn(),
    createMusicApiMock: vi.fn(() => ({})),
    createModerationApiMock: vi.fn(() => ({})),
    createAutoModApiMock: vi.fn(() => ({})),
    createLogsApiMock: vi.fn(() => ({})),
}))

vi.mock('axios', () => ({
    default: {
        create: axiosCreateMock,
    },
}))

vi.mock('./apiBase', () => ({
    inferApiBase: inferApiBaseMock,
}))

vi.mock('./musicApi', () => ({
    createMusicApi: createMusicApiMock,
}))

vi.mock('./moderationApi', () => ({
    createModerationApi: createModerationApiMock,
}))

vi.mock('./automodApi', () => ({
    createAutoModApi: createAutoModApiMock,
}))

vi.mock('./logsApi', () => ({
    createLogsApi: createLogsApiMock,
}))

type ResponseErrorHandler = (error: {
    message?: string
    response?: {
        status: number
        data?: { error?: string; details?: unknown }
    }
}) => Promise<never>

const loadApiModule = async (inferredBase = '/api') => {
    vi.resetModules()
    inferApiBaseMock.mockReturnValue(inferredBase)

    const responseUse = vi.fn()
    const apiClient = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: {
            response: {
                use: responseUse,
            },
        },
    }
    axiosCreateMock.mockReturnValue(apiClient)

    const module = await import('./api')
    return { module, responseUse, apiClient }
}

describe('api service bootstrap', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    test('normalizes API base URL and exposes login URL from normalized base', async () => {
        const { module } = await loadApiModule('https://example.com/api///')

        expect(axiosCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: 'https://example.com/api',
                withCredentials: true,
            }),
        )
        expect(module.api.auth.getDiscordLoginUrl()).toBe(
            'https://example.com/api/auth/discord',
        )
        expect(module.api.lastfm.getConnectUrl()).toBe(
            'https://example.com/api/lastfm/connect',
        )
    })

    test('redirects to Discord login on 401 responses', async () => {
        const assignMock = vi.fn()
        vi.stubGlobal('window', {
            location: {
                assign: assignMock,
            },
        } as unknown as Window & typeof globalThis)
        const { responseUse } = await loadApiModule('/api/')

        const onError = responseUse.mock.calls[0][1] as ResponseErrorHandler

        await expect(
            onError({
                message: 'Unauthorized',
                response: {
                    status: 401,
                    data: { error: 'Unauthorized' },
                },
            }),
        ).rejects.toMatchObject({
            name: 'ApiError',
            status: 401,
            message: 'Unauthorized',
        })

        expect(assignMock).toHaveBeenCalledWith('/api/auth/discord')
    })

    test('returns connectivity ApiError when response is missing', async () => {
        const assignMock = vi.fn()
        vi.stubGlobal('window', {
            location: {
                assign: assignMock,
            },
        } as unknown as Window & typeof globalThis)
        const { responseUse } = await loadApiModule('/api')

        const onError = responseUse.mock.calls[0][1] as ResponseErrorHandler

        await expect(
            onError({ message: 'Network Error' }),
        ).rejects.toMatchObject({
            status: 0,
            message: 'Unable to connect to the server',
        })
        expect(assignMock).not.toHaveBeenCalled()
    })

    test('maps guild listing fields including nullable metrics and RBAC metadata', async () => {
        const { module, apiClient } = await loadApiModule('/api')
        const effectiveAccess = {
            overview: 'manage',
            settings: 'view',
            moderation: 'none',
            automation: 'none',
            music: 'none',
            integrations: 'none',
        } as const

        apiClient.get.mockResolvedValue({
            data: {
                guilds: [
                    {
                        id: '123',
                        name: 'Guild 123',
                        icon: null,
                        owner: false,
                        permissions: '0',
                        features: [],
                        hasBot: true,
                        botInviteUrl: 'https://discord.com/oauth2/authorize',
                        memberCount: null,
                        categoryCount: 4,
                        textChannelCount: 12,
                        voiceChannelCount: 3,
                        roleCount: null,
                        effectiveAccess,
                        canManageRbac: true,
                    },
                ],
            },
        })

        const response = await module.api.guilds.list()

        expect(response.data.guilds).toEqual([
            expect.objectContaining({
                id: '123',
                memberCount: null,
                categoryCount: 4,
                textChannelCount: 12,
                voiceChannelCount: 3,
                roleCount: null,
                effectiveAccess,
                canManageRbac: true,
            }),
        ])
    })

    test('exposes RBAC and member-context endpoints on guilds api', async () => {
        const { module, apiClient } = await loadApiModule('/api')

        await module.api.guilds.getMe('guild-1')
        await module.api.guilds.getRbac('guild-1')
        await module.api.guilds.updateRbac('guild-1', [
            {
                roleId: '222222222222222222',
                module: 'moderation',
                mode: 'manage',
            },
        ])

        expect(apiClient.get).toHaveBeenNthCalledWith(1, '/guilds/guild-1/me')
        expect(apiClient.get).toHaveBeenNthCalledWith(2, '/guilds/guild-1/rbac')
        expect(apiClient.put).toHaveBeenCalledWith('/guilds/guild-1/rbac', {
            grants: [
                {
                    roleId: '222222222222222222',
                    module: 'moderation',
                    mode: 'manage',
                },
            ],
        })
    })

    test('maps transformed auth, guild, and feature responses', async () => {
        const { module, apiClient } = await loadApiModule('/api')

        apiClient.get
            .mockResolvedValueOnce({
                data: {
                    id: 'user-1',
                    username: 'Lucky',
                },
            })
            .mockResolvedValueOnce({
                data: {
                    id: 'guild-1',
                    name: 'Guild',
                    icon: null,
                    owner: false,
                    permissions: '0',
                    features: [],
                    hasBot: true,
                },
            })
            .mockResolvedValueOnce({
                data: {
                    features: [{ name: 'music', description: 'Music module' }],
                },
            })
            .mockResolvedValueOnce({
                data: {
                    guildId: 'guild-1',
                    toggles: { music: { enabled: true } },
                },
            })

        const authResponse = await module.api.auth.getUser()
        const guildResponse = await module.api.guilds.get('guild-1')
        const featuresResponse = await module.api.features.list()
        const togglesResponse = await module.api.features.getServerToggles(
            'guild-1',
        )

        expect(authResponse.data.user).toEqual({
            id: 'user-1',
            username: 'Lucky',
        })
        expect(guildResponse.data.guild).toEqual(
            expect.objectContaining({
                id: 'guild-1',
                botAdded: true,
            }),
        )
        expect(featuresResponse.data.features).toEqual([
            {
                name: 'music',
                description: 'Music module',
                isGlobal: false,
            },
        ])
        expect(togglesResponse.data.toggles).toEqual({
            music: { enabled: true },
        })
    })

    test('wires endpoint helpers to expected paths and payloads', async () => {
        const { module, apiClient } = await loadApiModule('/api')

        apiClient.get.mockResolvedValue({ data: {} })
        apiClient.post.mockResolvedValue({ data: {} })
        apiClient.delete.mockResolvedValue({ data: {} })

        await module.api.auth.checkStatus()
        await module.api.auth.logout()
        await module.api.guilds.getInvite('guild-1')
        await module.api.guilds.getSettings('guild-1')
        await module.api.guilds.updateSettings('guild-1', {
            commandPrefix: '!',
        })
        await module.api.modules.list('guild-1')
        await module.api.modules.get('guild-1', 'music')
        await module.api.modules.toggle('guild-1', 'music', true)
        await module.api.modules.getSettings('guild-1', 'music')
        await module.api.modules.updateSettings('guild-1', 'music', {
            volume: 80,
        })
        await module.api.commands.list('guild-1')
        await module.api.commands.toggle('guild-1', 'play', false)
        await module.api.commands.getSettings('guild-1', 'play')
        await module.api.commands.updateSettings('guild-1', 'play', {
            cooldown: 10,
        })
        await module.api.features.getGlobalToggles()
        await module.api.features.updateGlobalToggle('music', true)
        await module.api.features.updateServerToggle('guild-1', 'music', false)
        await module.api.trackHistory.getHistory('guild-1')
        await module.api.trackHistory.getStats('guild-1')
        await module.api.trackHistory.getTopTracks('guild-1')
        await module.api.trackHistory.getTopArtists('guild-1')
        await module.api.trackHistory.clearHistory('guild-1')
        await module.api.twitch.list('guild-1')
        await module.api.twitch.add('guild-1', {
            twitchUserId: 'tw-1',
            twitchLogin: 'lucky',
            discordChannelId: 'chan-1',
        })
        await module.api.twitch.remove('guild-1', 'tw-1')
        await module.api.lastfm.status()
        await module.api.lastfm.unlink()
        await module.api.lyrics.search('Take On Me')
        await module.api.lyrics.search('Take On Me', 'a-ha')

        expect(apiClient.get).toHaveBeenCalledWith('/auth/status')
        expect(apiClient.get).toHaveBeenCalledWith('/auth/logout')
        expect(apiClient.get).toHaveBeenCalledWith('/guilds/guild-1/invite')
        expect(apiClient.get).toHaveBeenCalledWith('/guilds/guild-1/settings')
        expect(apiClient.post).toHaveBeenCalledWith('/guilds/guild-1/settings', {
            commandPrefix: '!',
        })
        expect(apiClient.get).toHaveBeenCalledWith('/guilds/guild-1/modules')
        expect(apiClient.get).toHaveBeenCalledWith('/guilds/guild-1/modules/music')
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/modules/music/toggle',
            { enabled: true },
        )
        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild-1/modules/music/settings',
        )
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/modules/music/settings',
            { volume: 80 },
        )
        expect(apiClient.get).toHaveBeenCalledWith('/guilds/guild-1/commands')
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/commands/play/toggle',
            { enabled: false },
        )
        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild-1/commands/play/settings',
        )
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/commands/play/settings',
            { cooldown: 10 },
        )
        expect(apiClient.get).toHaveBeenCalledWith('/toggles/global')
        expect(apiClient.post).toHaveBeenCalledWith('/toggles/global/music', {
            enabled: true,
        })
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/features/music',
            { enabled: false },
        )
        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild-1/music/history?limit=10',
        )
        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild-1/music/history/stats',
        )
        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild-1/music/history/top-tracks?limit=10',
        )
        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild-1/music/history/top-artists?limit=10',
        )
        expect(apiClient.delete).toHaveBeenCalledWith('/guilds/guild-1/music/history')
        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild-1/twitch/notifications',
        )
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/twitch/notifications',
            {
                twitchUserId: 'tw-1',
                twitchLogin: 'lucky',
                discordChannelId: 'chan-1',
            },
        )
        expect(apiClient.delete).toHaveBeenCalledWith(
            '/guilds/guild-1/twitch/notifications',
            { data: { twitchUserId: 'tw-1' } },
        )
        expect(apiClient.get).toHaveBeenCalledWith('/lastfm/status')
        expect(apiClient.delete).toHaveBeenCalledWith('/lastfm/unlink')
        expect(apiClient.get).toHaveBeenCalledWith('/lyrics?title=Take+On+Me')
        expect(apiClient.get).toHaveBeenCalledWith(
            '/lyrics?title=Take+On+Me&artist=a-ha',
        )
    })
})
