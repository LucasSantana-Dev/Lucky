import type { AxiosInstance } from 'axios'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createAutoMessagesApi } from './autoMessagesApi'

const apiClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
} as unknown as AxiosInstance

describe('createAutoMessagesApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('list calls GET /guilds/:guildId/automessages', () => {
        const api = createAutoMessagesApi(apiClient)
        api.list('guild-1')
        expect(apiClient.get).toHaveBeenCalledWith('/guilds/guild-1/automessages')
    })

    test('create calls POST /guilds/:guildId/automessages with data', () => {
        const api = createAutoMessagesApi(apiClient)
        const data = { name: 'Test', channel: 'ch-1', content: 'Hello', interval: 3600 }
        api.create('guild-1', data)
        expect(apiClient.post).toHaveBeenCalledWith('/guilds/guild-1/automessages', data)
    })

    test('update calls PATCH /guilds/:guildId/automessages/:id with data', () => {
        const api = createAutoMessagesApi(apiClient)
        const data = { content: 'Updated' }
        api.update('guild-1', 'msg-1', data)
        expect(apiClient.patch).toHaveBeenCalledWith('/guilds/guild-1/automessages/msg-1', data)
    })

    test('toggle calls PATCH /guilds/:guildId/automessages/:id/toggle with enabled=true', () => {
        const api = createAutoMessagesApi(apiClient)
        api.toggle('guild-1', 'msg-1', true)
        expect(apiClient.patch).toHaveBeenCalledWith('/guilds/guild-1/automessages/msg-1/toggle', {
            enabled: true,
        })
    })

    test('toggle calls PATCH /guilds/:guildId/automessages/:id/toggle with enabled=false', () => {
        const api = createAutoMessagesApi(apiClient)
        api.toggle('guild-2', 'msg-2', false)
        expect(apiClient.patch).toHaveBeenCalledWith('/guilds/guild-2/automessages/msg-2/toggle', {
            enabled: false,
        })
    })

    test('delete calls DELETE /guilds/:guildId/automessages/:id', () => {
        const api = createAutoMessagesApi(apiClient)
        api.delete('guild-1', 'msg-1')
        expect(apiClient.delete).toHaveBeenCalledWith('/guilds/guild-1/automessages/msg-1')
    })
})
