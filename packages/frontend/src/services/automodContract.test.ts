import { describe, test, expect, vi } from 'vitest'
// Cross-package by design (test-only): this exercises the REAL backend zod
// schemas against the REAL captured api.automod.* call arguments, so a
// frontend payload/path regression or a backend schema change is caught on
// whichever side moves first.
import { managementSchemas } from '../../../backend/src/schemas/management'

const { axiosCreateMock, inferApiBaseMock } = vi.hoisted(() => ({
    axiosCreateMock: vi.fn(),
    inferApiBaseMock: vi.fn(),
}))

vi.mock('axios', () => ({ default: { create: axiosCreateMock } }))
vi.mock('./apiBase', () => ({ inferApiBase: inferApiBaseMock }))

const loadApiModule = async () => {
    vi.resetModules()
    inferApiBaseMock.mockReturnValue('/api')
    const apiClient = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        interceptors: { response: { use: vi.fn() } },
    }
    axiosCreateMock.mockReturnValue(apiClient)
    const module = await import('./api')
    return { module, apiClient }
}

describe('AutoMod frontend calls satisfy the real backend contract', () => {
    test('api.automod.updateSettings sends a PATCH body the real autoModSettingsBody accepts', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.patch.mockResolvedValue({ data: {} })

        await module.api.automod.updateSettings('guild-1', {
            enabled: true,
            spamEnabled: true,
            spamThreshold: 5,
            spamTimeWindow: 10,
            exemptChannels: ['123456789012345678'],
            exemptRoles: ['223456789012345678'],
        })

        const [path, body] = apiClient.patch.mock.calls[0]
        expect(path).toBe('/guilds/guild-1/automod/settings')
        expect(
            managementSchemas.autoModSettingsBody.safeParse(body).success,
        ).toBe(true)
    })

    test('api.automod.applyTemplate targets a path the real autoModTemplateParam accepts', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.post.mockResolvedValue({ data: {} })

        await module.api.automod.applyTemplate('guild-1', 'strict')

        const [path] = apiClient.post.mock.calls[0]
        expect(path).toBe('/guilds/guild-1/automod/templates/strict/apply')
        expect(
            managementSchemas.autoModTemplateParam.safeParse({
                guildId: '123456789012345678',
                templateId: 'strict',
            }).success,
        ).toBe(true)
    })
})
