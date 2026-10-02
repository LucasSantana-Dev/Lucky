import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRolesManageApi } from './rolesManageApi'
import { ApiError } from './ApiError'

describe('createRolesManageApi', () => {
    const get = vi.fn()
    const post = vi.fn()
    const patch = vi.fn()
    const del = vi.fn()
    const apiClient = { get, post, patch, delete: del }

    const ROLE = {
        id: '111',
        name: 'Mod',
        color: 0xff0000,
        hoist: true,
        mentionable: false,
        permissions: '8',
        position: 1,
        managed: false,
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('list returns roles on success', async () => {
        get.mockResolvedValue({ data: { roles: [ROLE] } })
        const api = createRolesManageApi(apiClient as any)
        const result = await api.list('g1')
        expect(get).toHaveBeenCalledWith('/guilds/g1/roles/manage')
        expect(result).toEqual([ROLE])
    })

    test('client (4xx) ApiErrors propagate so callers can show the message', async () => {
        const api = createRolesManageApi(apiClient as any)
        const err = new ApiError(403, 'Missing Manage Roles permission')
        post.mockRejectedValue(err)
        patch.mockRejectedValue(err)
        del.mockRejectedValue(err)
        await expect(api.create('g1', { name: 'Mod' })).rejects.toBe(err)
        await expect(api.update('g1', '1', { name: 'Mod' })).rejects.toBe(err)
        await expect(api.delete('g1', '1')).rejects.toBe(err)
        await expect(api.duplicate('g1', '1')).rejects.toBe(err)
        await expect(api.bulkDelete('g1', ['1'])).rejects.toBe(err)
    })

    test('5xx ApiErrors still resolve to the null/false sentinel', async () => {
        const api = createRolesManageApi(apiClient as any)
        del.mockRejectedValue(new ApiError(502, 'bad gateway'))
        expect(await api.delete('g1', '1')).toBe(false)
    })

    test('list returns null on error', async () => {
        get.mockRejectedValue(new Error('network'))
        const api = createRolesManageApi(apiClient as any)
        expect(await api.list('g1')).toBeNull()
    })

    test('create returns role on success', async () => {
        post.mockResolvedValue({ data: { role: ROLE } })
        const api = createRolesManageApi(apiClient as any)
        const result = await api.create('g1', { name: 'Mod' })
        expect(post).toHaveBeenCalledWith('/guilds/g1/roles/manage', {
            name: 'Mod',
        })
        expect(result).toEqual(ROLE)
    })

    test('create returns null on error', async () => {
        post.mockRejectedValue(new Error('network'))
        const api = createRolesManageApi(apiClient as any)
        expect(await api.create('g1', { name: 'Mod' })).toBeNull()
    })

    test('update returns role on success', async () => {
        patch.mockResolvedValue({ data: { role: ROLE } })
        const api = createRolesManageApi(apiClient as any)
        const result = await api.update('g1', '111', { name: 'Mod' })
        expect(patch).toHaveBeenCalledWith('/guilds/g1/roles/manage/111', {
            name: 'Mod',
        })
        expect(result).toEqual(ROLE)
    })

    test('update returns null on error', async () => {
        patch.mockRejectedValue(new Error('network'))
        const api = createRolesManageApi(apiClient as any)
        expect(await api.update('g1', '111', { name: 'Mod' })).toBeNull()
    })

    test('delete returns true on success', async () => {
        del.mockResolvedValue({})
        const api = createRolesManageApi(apiClient as any)
        expect(await api.delete('g1', '111')).toBe(true)
        expect(del).toHaveBeenCalledWith('/guilds/g1/roles/manage/111')
    })

    test('delete returns false on error', async () => {
        del.mockRejectedValue(new Error('network'))
        const api = createRolesManageApi(apiClient as any)
        expect(await api.delete('g1', '111')).toBe(false)
    })

    test('duplicate returns role on success', async () => {
        post.mockResolvedValue({ data: { role: ROLE } })
        const api = createRolesManageApi(apiClient as any)
        const result = await api.duplicate('g1', '111')
        expect(post).toHaveBeenCalledWith(
            '/guilds/g1/roles/manage/111/duplicate',
        )
        expect(result).toEqual(ROLE)
    })

    test('duplicate returns null on error', async () => {
        post.mockRejectedValue(new Error('network'))
        const api = createRolesManageApi(apiClient as any)
        expect(await api.duplicate('g1', '111')).toBeNull()
    })

    test('bulkDelete returns result on success', async () => {
        post.mockResolvedValue({
            data: { deleted: ['111'], failed: [] },
        })
        const api = createRolesManageApi(apiClient as any)
        const result = await api.bulkDelete('g1', ['111'])
        expect(post).toHaveBeenCalledWith(
            '/guilds/g1/roles/manage/bulk-delete',
            { roleIds: ['111'] },
        )
        expect(result).toEqual({ deleted: ['111'], failed: [] })
    })

    test('bulkDelete returns null on error', async () => {
        post.mockRejectedValue(new Error('network'))
        const api = createRolesManageApi(apiClient as any)
        expect(await api.bulkDelete('g1', ['111'])).toBeNull()
    })
})
