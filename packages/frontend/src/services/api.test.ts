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
        interceptors: {
            response: {
                use: responseUse,
            },
        },
    }
    axiosCreateMock.mockReturnValue(apiClient)

    const module = await import('./api')
    return { module, responseUse }
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
    })

    test('redirects to Discord login on 401 responses', async () => {
        const assignMock = vi.fn()
        vi.stubGlobal(
            'window',
            {
                location: {
                    assign: assignMock,
                },
            } as unknown as Window & typeof globalThis,
        )
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
        vi.stubGlobal(
            'window',
            {
                location: {
                    assign: assignMock,
                },
            } as unknown as Window & typeof globalThis,
        )
        const { responseUse } = await loadApiModule('/api')

        const onError = responseUse.mock.calls[0][1] as ResponseErrorHandler

        await expect(onError({ message: 'Network Error' })).rejects.toMatchObject({
            status: 0,
            message: 'Unable to connect to the server',
        })
        expect(assignMock).not.toHaveBeenCalled()
    })
})
