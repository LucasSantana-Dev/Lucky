import { getPrismaClient } from '../../utils/database/prismaClient.js'
import { Prisma } from '../../generated/prisma/client.js'
import type { ScopeConfig, BatchJobType, BatchJobStatus } from './types.js'

/**
 * Service for managing batch job persistence, state transitions, and item tracking.
 * Uses Prisma to store and retrieve batch jobs and their individual items.
 */
export class BatchJobService {
    /**
     * Creates a new batch job for a guild.
     */
    async create(input: {
        guildId: string
        jobType: BatchJobType
        initiatedBy: string
        sourceChannelId?: string
        targetChannelId?: string
        scope: ScopeConfig
        options?: Record<string, unknown>
        totalItems: number
        estimatedMinutes?: number
    }) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.create({
            data: {
                guildId: input.guildId,
                jobType: input.jobType,
                initiatedBy: input.initiatedBy,
                sourceChannelId: input.sourceChannelId,
                targetChannelId: input.targetChannelId,
                scope: JSON.parse(
                    JSON.stringify(input.scope),
                ) as unknown as Prisma.InputJsonValue,
                options: input.options
                    ? (JSON.parse(
                          JSON.stringify(input.options),
                      ) as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                totalItems: input.totalItems,
                estimatedMinutes: input.estimatedMinutes,
                status: 'pending',
            },
        })
    }

    /**
     * Retrieves a batch job by ID.
     */
    async getById(jobId: string, options?: { includeItems?: boolean }) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.findUnique({
            where: { id: jobId },
            include: options?.includeItems ? { items: true } : undefined,
        })
    }

    /**
     * Lists batch jobs for a guild with pagination.
     */
    async listByGuild(
        guildId: string,
        options?: {
            status?: BatchJobStatus
            limit?: number
            offset?: number
            orderBy?: 'newest' | 'oldest'
        },
    ) {
        const prisma = getPrismaClient()
        const limit = options?.limit ?? 20
        const offset = options?.offset ?? 0
        const orderBy = options?.orderBy === 'oldest' ? 'asc' : 'desc'

        const where: Record<string, unknown> = { guildId }
        if (options?.status) {
            where.status = options.status
        }

        return await prisma.batchJob.findMany({
            where,
            orderBy: { createdAt: orderBy },
            take: limit,
            skip: offset,
        })
    }

    /**
     * Marks a batch job as in-progress.
     */
    async markInProgress(jobId: string) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.update({
            where: { id: jobId },
            data: {
                status: 'in_progress',
                startedAt: new Date(),
            },
        })
    }

    /**
     * Marks a batch job as paused.
     */
    async markPaused(jobId: string) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.update({
            where: { id: jobId },
            data: { status: 'paused' },
        })
    }

    /**
     * Marks a batch job as completed.
     */
    async markCompleted(jobId: string) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.update({
            where: { id: jobId },
            data: {
                status: 'completed',
                completedAt: new Date(),
            },
        })
    }

    /**
     * Marks a batch job as cancelled.
     */
    async markCancelled(jobId: string) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.update({
            where: { id: jobId },
            data: {
                status: 'cancelled',
                completedAt: new Date(),
            },
        })
    }

    /**
     * Marks a batch job as failed with an optional error message.
     */
    async markFailed(jobId: string, errorLog?: string) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.update({
            where: { id: jobId },
            data: {
                status: 'failed',
                completedAt: new Date(),
                errorLog,
            },
        })
    }

    /**
     * Checkpoints progress: updates processed/failed counts and nextCursor for resumability.
     * Called before destructive steps to ensure crash-safety.
     */
    async checkpoint(
        jobId: string,
        updates: {
            processedItems: number
            failedItems: number
            skippedItems: number
            nextCursor?: string
        },
    ) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.update({
            where: { id: jobId },
            data: {
                processedItems: updates.processedItems,
                failedItems: updates.failedItems,
                skippedItems: updates.skippedItems,
                nextCursor: updates.nextCursor,
                lastProgressAt: new Date(),
            },
        })
    }

    /**
     * Records a single item result in the batch job.
     */
    async recordItem(
        jobId: string,
        input: {
            targetId: string
            status: 'pending' | 'success' | 'skipped' | 'failed'
            error?: string
            resultMetadata?: Record<string, unknown>
        },
    ) {
        const prisma = getPrismaClient()
        return await prisma.batchJobItem.create({
            data: {
                jobId,
                targetId: input.targetId,
                status: input.status,
                error: input.error,
                resultMetadata: input.resultMetadata
                    ? (JSON.parse(
                          JSON.stringify(input.resultMetadata),
                      ) as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                attemptedAt: new Date(),
            },
        })
    }

    /**
     * Sets the final summary for a batch job after completion.
     */
    async setSummary(jobId: string, summary: Record<string, unknown>) {
        const prisma = getPrismaClient()
        return await prisma.batchJob.update({
            where: { id: jobId },
            data: {
                summary: JSON.parse(
                    JSON.stringify(summary),
                ) as unknown as Prisma.InputJsonValue,
            },
        })
    }
}

export const batchJobService = new BatchJobService()
