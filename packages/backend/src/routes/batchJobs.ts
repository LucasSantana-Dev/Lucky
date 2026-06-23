import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { batchJobsSchemas as s } from '../schemas/batchJobs'
import {
    batchJobService,
    serverLogService,
    redisClient,
} from '@lucky/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupBatchJobRoutes(app: Express): void {
    /**
     * GET /api/guilds/:guildId/batch-jobs
     * List batch jobs with optional filtering and pagination.
     * Guard: requireGuildModuleAccess('moderation', 'view')
     */
    app.get(
        '/api/guilds/:guildId/batch-jobs',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.guildIdParam),
        validateQuery(s.listQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const query = s.listQuery.parse(req.query)
            const { status, limit = 20, offset = 0 } = query

            const jobs = await batchJobService.listByGuild(guildId, {
                status: status as any,
                limit,
                offset,
                orderBy: 'newest',
            })

            res.json({ jobs })
        }),
    )

    /**
     * GET /api/guilds/:guildId/batch-jobs/:jobId
     * Retrieve a single batch job with its items.
     * Guard: requireGuildModuleAccess('moderation', 'view')
     */
    app.get(
        '/api/guilds/:guildId/batch-jobs/:jobId',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.jobIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const jobId = p(req.params.jobId)

            const job = await batchJobService.getById(jobId)
            if (!job) {
                throw AppError.notFound('Batch job not found')
            }

            // Verify the job belongs to this guild
            if (job.guildId !== guildId) {
                throw AppError.notFound('Batch job not found')
            }

            res.json({ job })
        }),
    )

    /**
     * GET /api/guilds/:guildId/batch-jobs/:jobId/progress
     * Retrieve the live progress for a batch job from Redis.
     * Returns null if no progress is available.
     * Guard: requireGuildModuleAccess('moderation', 'view')
     */
    app.get(
        '/api/guilds/:guildId/batch-jobs/:jobId/progress',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.jobIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const jobId = p(req.params.jobId)

            // Verify the job exists and belongs to this guild
            const job = await batchJobService.getById(jobId)
            if (!job) {
                throw AppError.notFound('Batch job not found')
            }

            if (job.guildId !== guildId) {
                throw AppError.notFound('Batch job not found')
            }

            // Read progress from Redis key: job:<jobId>:progress
            const progressKey = `job:${jobId}:progress`
            const progressJson = await redisClient.get(progressKey)

            let progress = null
            if (progressJson) {
                try {
                    progress = JSON.parse(progressJson)
                } catch {
                    // If parsing fails, return null (corrupted data)
                    progress = null
                }
            }

            res.json({ progress })
        }),
    )

    /**
     * POST /api/guilds/:guildId/batch-jobs/:jobId/cancel
     * Cancel a batch job.
     * Guard: requireGuildModuleAccess('moderation', 'manage')
     */
    app.post(
        '/api/guilds/:guildId/batch-jobs/:jobId/cancel',
        requireAuth,
        requireGuildModuleAccess('moderation', 'manage'),
        validateParams(s.jobIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const jobId = p(req.params.jobId)
            const userId = requireUserId(req)

            // Verify the job exists and belongs to this guild
            const job = await batchJobService.getById(jobId)
            if (!job) {
                throw AppError.notFound('Batch job not found')
            }

            if (job.guildId !== guildId) {
                throw AppError.notFound('Batch job not found')
            }

            // Cannot cancel already-completed jobs
            if (
                job.status === 'completed' ||
                job.status === 'failed' ||
                job.status === 'cancelled'
            ) {
                throw AppError.badRequest(
                    `Cannot cancel a job with status "${job.status}"`,
                )
            }

            // Mark as cancelled and log the audit event
            const updated = await batchJobService.markCancelled(jobId)
            await serverLogService.createLog(
                guildId,
                'mod_action',
                'batch_job_cancel',
                {
                    jobId,
                    jobType: job.jobType,
                    status: updated.status,
                },
                { moderatorId: userId },
            )

            res.json({ job: updated })
        }),
    )
}
