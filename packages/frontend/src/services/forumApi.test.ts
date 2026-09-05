import { describe, test, expect, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { ApiError } from './ApiError'
import { createForumApi } from './forumApi'

function makeClient(impl: () => Promise<unknown>): AxiosInstance {
    return { get: vi.fn(impl) } as unknown as AxiosInstance
}

describe('createForumApi', () => {
    test('getThread returns the thread on success', async () => {
        const thread = {
            threadId: 't1',
            slug: 'music',
            title: 'Music thread',
            archived: false,
            url: 'https://discord.com/channels/g1/t1',
        }
        const client = makeClient(() => Promise.resolve({ data: thread }))
        const api = createForumApi(client)

        await expect(api.getThread('g1', 'music')).resolves.toEqual(thread)
        expect(client.get).toHaveBeenCalledWith('/guilds/g1/threads/music')
    })

    test('getThread returns null on 404', async () => {
        const client = makeClient(() =>
            Promise.reject(new ApiError(404, 'Thread not found')),
        )
        const api = createForumApi(client)

        await expect(api.getThread('g1', 'music')).resolves.toBeNull()
    })

    test('getThread rethrows non-404 errors', async () => {
        const client = makeClient(() =>
            Promise.reject(new ApiError(500, 'boom')),
        )
        const api = createForumApi(client)

        await expect(api.getThread('g1', 'music')).rejects.toThrow('boom')
    })
})
