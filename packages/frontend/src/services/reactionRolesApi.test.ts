import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createReactionRolesApi } from './reactionRolesApi'

describe('createReactionRolesApi', () => {
    const get = vi.fn()
    const post = vi.fn()
    const put = vi.fn()
    const del = vi.fn()
    const apiClient = { get, post, put, delete: del }

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

    test('create with imageFile sends multipart FormData', async () => {
        post.mockResolvedValue({ data: { messageId: '789' } })
        const api = createReactionRolesApi(apiClient as never)
        const payload = {
            channelId: '456',
            title: 'Pick a role',
            description: 'Tap a button',
            roles: [{ roleId: '111', label: 'Mod' }],
        }
        const imageFile = new File(['fake-data'], 'test.png', {
            type: 'image/png',
        })
        const result = await api.create('g1', payload, imageFile)
        expect(post).toHaveBeenCalled()
        const callArgs = post.mock.calls[0]
        expect(callArgs[0]).toBe('/guilds/g1/reaction-roles')
        const formData = callArgs[1] as FormData
        expect(formData instanceof FormData).toBe(true)
        expect(formData.get('image')).toBe(imageFile)
        expect(formData.get('payload')).toBe(JSON.stringify(payload))
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

    test('update without imageFile posts JSON payload', async () => {
        put.mockResolvedValue({ data: { messageId: '789' } })
        const api = createReactionRolesApi(apiClient as never)
        const payload = {
            title: 'Updated title',
            description: 'Updated description',
            roles: [{ roleId: '111', label: 'Mod' }],
        }
        const result = await api.update('g1', 'msg-1', payload)
        expect(put).toHaveBeenCalledWith(
            '/guilds/g1/reaction-roles/msg-1',
            payload,
        )
        expect(result).toEqual({ messageId: '789' })
    })

    test('update with imageFile sends multipart FormData', async () => {
        put.mockResolvedValue({ data: { messageId: '789' } })
        const api = createReactionRolesApi(apiClient as never)
        const payload = {
            title: 'Updated title',
            description: 'Updated description',
            roles: [{ roleId: '111', label: 'Mod' }],
        }
        const imageFile = new File(['new-data'], 'updated.png', {
            type: 'image/png',
        })
        const result = await api.update('g1', 'msg-1', payload, imageFile)
        expect(put).toHaveBeenCalled()
        const callArgs = put.mock.calls[0]
        expect(callArgs[0]).toBe('/guilds/g1/reaction-roles/msg-1')
        const formData = callArgs[1] as FormData
        expect(formData instanceof FormData).toBe(true)
        expect(formData.get('image')).toBe(imageFile)
        expect(formData.get('payload')).toBe(JSON.stringify(payload))
        expect(result).toEqual({ messageId: '789' })
    })
})
