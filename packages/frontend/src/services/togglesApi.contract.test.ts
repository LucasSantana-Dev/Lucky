import { describe, test, expect, vi, beforeEach } from 'vitest'
import { togglesSchemas } from '../../../backend/src/schemas/toggles'

const { axiosCreateMock } = vi.hoisted(() => ({ axiosCreateMock: vi.fn() }))

vi.mock('axios', () => ({ default: { create: axiosCreateMock } }))

describe('feature toggles frontend/backend contract', () => {
    const apiClient = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        interceptors: { response: { use: vi.fn() } },
    }

    beforeEach(() => {
        vi.resetModules()
        axiosCreateMock.mockReturnValue(apiClient)
        apiClient.post.mockClear()
    })

    test('the global toggle update sends name in the path and a body the backend schemas accept', async () => {
        const { api } = await import('./api')
        api.features.updateGlobalToggle('DOWNLOAD_VIDEO', true)

        const [path, body] = apiClient.post.mock.calls[0]
        expect(path).toBe('/toggles/global/DOWNLOAD_VIDEO')
        expect(body).toEqual({ enabled: true })
        expect(togglesSchemas.toggleEnabledBody.safeParse(body).success).toBe(
            true,
        )
        expect(
            togglesSchemas.toggleNameParam.safeParse({
                name: path.split('/').pop(),
            }).success,
        ).toBe(true)
    })

    test('a toggle body with a non-boolean enabled is rejected for the enabled field', () => {
        const result = togglesSchemas.toggleEnabledBody.safeParse({
            enabled: 'yes',
        })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'invalid_type',
            path: ['enabled'],
        })
    })
})
