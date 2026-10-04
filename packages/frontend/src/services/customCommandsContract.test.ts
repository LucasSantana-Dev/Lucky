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

    test('a toggle body without a boolean enabled is rejected for the enabled field type, not for another reason', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.patch.mockResolvedValue({ data: {} })

        await module.api.commands.toggle('guild-1', 'give-role', false)

        const [, body] = apiClient.patch.mock.calls[0]
        const result = managementSchemas.updateCommandBody.safeParse({
            ...body,
            enabled: 'false',
        })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'invalid_type',
            path: ['enabled'],
        })
    })

    test('an update body carrying a create-only key such as name is rejected as an unrecognized key', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.patch.mockResolvedValue({ data: {} })

        await module.api.commands.update('guild-1', 'give-role', {
            response: 'Updated!',
        })

        const [, body] = apiClient.patch.mock.calls[0]
        const result = managementSchemas.updateCommandBody.safeParse({
            ...body,
            name: 'give-role',
        })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'unrecognized_keys',
            keys: ['name'],
        })
    })

    test('an update body with an empty response is rejected for the response length', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.patch.mockResolvedValue({ data: {} })

        await module.api.commands.update('guild-1', 'give-role', {
            response: '',
        })

        const [, body] = apiClient.patch.mock.calls[0]
        const result = managementSchemas.updateCommandBody.safeParse(body)

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]).toMatchObject({
            code: 'too_small',
            path: ['response'],
        })
    })

    test('the create rejection for an invalid name points at the name field, not response', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.post.mockResolvedValue({ data: {} })

        await module.api.commands.create('guild-1', {
            name: 'bad name!',
            response: 'hi',
        })

        const [, body] = apiClient.post.mock.calls[0]
        const result = managementSchemas.createCommandBody.safeParse(body)

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'invalid_format',
            path: ['name'],
        })
    })

    test('api.commands.list sends a bare GET because the backend defines no list query schema', async () => {
        const { module, apiClient } = await loadApiModule()
        apiClient.get.mockResolvedValue({ data: { commands: [] } })

        await module.api.commands.list('guild-1')

        expect(apiClient.get.mock.calls[0]).toEqual([
            '/guilds/guild-1/commands',
        ])
    })
})
