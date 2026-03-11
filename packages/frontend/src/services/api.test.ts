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
        patch: vi.fn(),
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
})
