import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createReactionRolesApi } from './reactionRolesApi'

describe('createReactionRolesApi', () => {
    const get = vi.fn()
    const post = vi.fn()
    const del = vi.fn()
    const apiClient = { get, post, delete: del }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('list returns the messages array', async () => {
        const messages = [
            {
                id: 'm1',
                messageId: '123',
                channelId: '456',
                guildId: 'g1',
                createdAt: '2026-06-22T00:00:00Z',
                mappings: [],
            },
        ]
        get.mockResolvedValue({ data: { messages } })
        const api = createReactionRolesApi(apiClient as never)
        const result = await api.list('g1')
        expect(get).toHaveBeenCalledWith('/guilds/g1/reaction-roles')
        expect(result).toEqual(messages)
    })

    test('create posts the payload and returns the messageId', async () => {
        post.mockResolvedValue({ data: { messageId: '789' } })
        const api = createReactionRolesApi(apiClient as never)
        const payload = {
            channelId: '456',
            title: 'Pick a role',
            description: 'Tap a button',
            roles: [{ roleId: '111', label: 'Mod' }],
        }
        const result = await api.create('g1', payload)
        expect(post).toHaveBeenCalledWith('/guilds/g1/reaction-roles', payload)
        expect(result).toEqual({ messageId: '789' })
    })

    test('delete calls the message endpoint', async () => {
        del.mockResolvedValue({})
        const api = createReactionRolesApi(apiClient as never)
        await api.delete('g1', 'm1')
        expect(del).toHaveBeenCalledWith('/guilds/g1/reaction-roles/m1')
    })

    test('listExclusions returns the exclusions array', async () => {
        const exclusions = [
            { id: 'e1', guildId: 'g1', roleId: '111', groupId: 'grp1' },
        ]
        get.mockResolvedValue({ data: { exclusions } })
        const api = createReactionRolesApi(apiClient as never)
        const result = await api.listExclusions('g1')
        expect(get).toHaveBeenCalledWith('/guilds/g1/roles/exclusive')
        expect(result).toEqual(exclusions)
    })
})
