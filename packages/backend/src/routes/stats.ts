import type { Express, Request, Response } from 'express'
import { z } from 'zod'
import { getPrismaClient } from '@lucky/shared/utils'
import { redisClient } from '@lucky/shared/services'
import { apiLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'

const statsResponseSchema = z.object({
    totalGuilds: z.number().int().nonnegative(),
    totalUsers: z.number().int().nonnegative(),
    uptimeSeconds: z.number().nonnegative(),
    serversOnline: z.number().int().nonnegative(),
})

export type StatsResponse = z.infer<typeof statsResponseSchema>

export function setupStatsRoutes(app: Express): void {
    app.get(
        '/api/stats/public',
        apiLimiter,
        asyncHandler(async (_req: Request, res: Response) => {
            const prisma = getPrismaClient()

            // Fetch guild count from database
            const totalGuilds = await prisma.guild.count()

            // Fetch user count from database
            const totalUsers = await prisma.user.count()

            // Get backend uptime in seconds
            const uptimeSeconds = process.uptime()

            // Get servers online (bot instances) - estimate from Redis keys or default to 1
            // For now, we check if Redis is healthy and count it as 1 server online
            const serversOnline = redisClient.isHealthy() ? 1 : 0

            const stats: StatsResponse = {
                totalGuilds,
                totalUsers,
                uptimeSeconds,
                serversOnline,
            }

            // Validate response schema
            const validatedStats = statsResponseSchema.parse(stats)

            // Set caching headers: cache for 60 seconds, allow stale responses for up to 60 more seconds
            res.set({
                'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=60',
                'Content-Type': 'application/json',
            })

            res.json(validatedStats)
        }),
    )
}
