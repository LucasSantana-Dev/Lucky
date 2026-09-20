import type { AxiosInstance } from 'axios'
import { ApiError } from './ApiError'

export interface ForumThread {
    threadId: string
    slug: string
    title: string
    archived: boolean
    url: string
}

export function createForumApi(client: AxiosInstance) {
    return {
        getThread: async (
            guildId: string,
            slug: string,
        ): Promise<ForumThread | null> => {
            try {
                const res = await client.get<ForumThread>(
                    `/guilds/${guildId}/threads/${slug}`,
                )
                return res.data
            } catch (err: unknown) {
                if (err instanceof ApiError && err.isNotFound) return null
                throw err
            }
        },
    }
}
