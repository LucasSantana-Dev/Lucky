import { describe, test, expect, vi } from 'vitest'
// Cross-package by design (test-only): this exercises the REAL backend zod
// schemas against the REAL captured api.commands.* call arguments, so a
// frontend payload/path regression or a backend schema change is caught on
// whichever side moves first (cubic review on #2408/#2446).
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

describe('CustomCommands frontend calls satisfy the real backend contract', () => {
    test('api.commands.create sends a POST /commands body the real createCommandBody accepts', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.post.mockResolvedValue({ data: {} })

        await module.api.commands.create('guild-1', {
            name: 'give-role',
            response: 'Here you go!',
            description: 'Gives a role',
        })

        const [path, body] = apiClient.post.mock.calls[0]
        expect(path).toBe('/guilds/guild-1/commands')
        expect(
            managementSchemas.createCommandBody.safeParse(body).success,
        ).toBe(true)
    })

    test('api.commands.update sends a PATCH /commands/:name body the real updateCommandBody accepts', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.patch.mockResolvedValue({ data: {} })

        await module.api.commands.update('guild-1', 'give-role', {
            response: 'Updated!',
        })

        const [path, body] = apiClient.patch.mock.calls[0]
        expect(path).toBe('/guilds/guild-1/commands/give-role')
        expect(
            managementSchemas.updateCommandBody.safeParse(body).success,
        ).toBe(true)
        expect(
            managementSchemas.commandNameParam.safeParse({
                guildId: '111111111111111111',
                name: 'give-role',
            }).success,
        ).toBe(true)
    })

    test('api.commands.toggle sends a PATCH /commands/:name body the real updateCommandBody accepts', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.patch.mockResolvedValue({ data: {} })

        await module.api.commands.toggle('guild-1', 'give-role', false)

        const [path, body] = apiClient.patch.mock.calls[0]
        expect(path).toBe('/guilds/guild-1/commands/give-role')
        expect(
            managementSchemas.updateCommandBody.safeParse(body).success,
        ).toBe(true)
    })

    test('an invalid command name from the create form is rejected by the real schema, not just the frontend', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.post.mockResolvedValue({ data: {} })

        await module.api.commands.create('guild-1', {
            name: 'bad name!',
            response: 'hi',
        })

        const [, body] = apiClient.post.mock.calls[0]
        expect(
            managementSchemas.createCommandBody.safeParse(body).success,
        ).toBe(false)
    })
})
