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
        // Resolves a forum-content slug to its Discord thread for a guild.
        // Returns null when no thread is mapped (guide has no thread yet).
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
