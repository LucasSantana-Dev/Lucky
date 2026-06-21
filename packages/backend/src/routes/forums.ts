import type { Express, Request, Response } from 'express'
import { z } from 'zod'
import { getPrismaClient } from '@lucky/shared/utils'
import { apiLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'

const threadResponseSchema = z.object({
    threadId: z.string(),
    slug: z.string(),
    title: z.string(),
    archived: z.boolean(),
    url: z.string(),
})

export type ForumThreadResponse = z.infer<typeof threadResponseSchema>

export function setupForumsRoutes(app: Express): void {
    // Public: resolve a forum-content slug to its Discord thread for a guild.
    // Returns 404 when no thread is mapped (guia has no Discord thread yet).
    // Used by the web app to render per-guia "Ver discussão no Discord" CTAs.
    app.get(
        '/api/guilds/:guildId/threads/:slug',
        apiLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            const { guildId, slug } = req.params as {
                guildId: string
                slug: string
            }

            const prisma = getPrismaClient()
            const thread = await prisma.guildForumThread.findUnique({
                where: { guildId_slug: { guildId, slug } },
                select: {
                    threadId: true,
                    slug: true,
                    title: true,
                    archived: true,
                },
            })

            if (!thread) {
                res.status(404).json({ error: 'Thread not found' })
                return
            }

            const response = threadResponseSchema.parse({
                ...thread,
                url: `https://discord.com/channels/${guildId}/${thread.threadId}`,
            })

            res.set(
                'Cache-Control',
                'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
            )
            res.json(response)
        }),
    )
}
