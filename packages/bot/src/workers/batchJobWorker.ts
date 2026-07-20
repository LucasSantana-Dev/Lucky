/**
 * BullMQ worker for batch job processing.
 * Loads jobs from the queue, resolves executors, and runs them with progress tracking.
 */

import Redis from 'ioredis'
import { Worker, type Job } from 'bullmq'

type BatchJobData = { jobId: string }
import { redisClient } from '@lucky/shared/services'
import { batchJobService } from '@lucky/shared/services/batch'
import type { BatchProgress, BatchJobType } from '@lucky/shared/services/batch'
import { errorLog, infoLog, debugLog } from '@lucky/shared/utils'
import { getExecutor, registerExecutor } from './executorRegistry'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'

const QUEUE_NAME = 'batch-jobs'
let worker: Worker<BatchJobData> | null = null
let bullmqRedis: Redis | null = null

/**
 * Progress callback that checkpoints to the database and publishes to Redis.
 * Called by executors to report live progress.
 */
async function onProgress(
    jobId: string,
    progress: BatchProgress,
): Promise<void> {
    try {
        // Checkpoint to database — persists nextCursor BEFORE the executor's
        // destructive step (executors await this first), so a crash resumes cleanly.
        await batchJobService.checkpoint(jobId, {
            processedItems: progress.processed,
            failedItems: progress.failed,
            skippedItems: progress.skipped,
            nextCursor: progress.nextCursor,
        })

        // Publish progress update to Redis (format: job:<id>:progress)
        const redis = redisClient.getClient()
        if (redis) {
            const key = `job:${jobId}:progress`
            const payload = JSON.stringify(progress)
            await redis.setex(key, 300, payload) // 5-minute TTL
        }

        debugLog({
            message: 'Batch job progress checkpointed',
            data: { jobId, progress },
        })
    } catch (error) {
        errorLog({
            message: 'Failed to checkpoint batch job progress',
            error,
            data: { jobId },
        })
        // Re-throw so the executor's `await onProgress(...)` surfaces the failure
        // instead of continuing with an unpersisted cursor.
        throw error
    }
}

/**
 * Processes a single batch job.
 * Loads the job from the database, resolves the executor, and runs it.
 */
async function processBatchJob(
    job: Job<BatchJobData>,
): Promise<Record<string, unknown>> {
    const jobId = job.data.jobId

    try {
        debugLog({
            message: 'Starting batch job processing',
            data: { jobId },
        })

        // Load the job from the database
        const dbJob = await batchJobService.getById(jobId)
        if (!dbJob) {
            throw new Error(`Batch job not found: ${jobId}`)
        }

        // Mark as in-progress
        await batchJobService.markInProgress(jobId)

        // Resolve the executor
        const executor = getExecutor(dbJob.jobType as BatchJobType)
        if (!executor) {
            throw new Error(
                `No executor registered for job type: ${dbJob.jobType}`,
            )
        }

        // Create a bound progress callback for this job
        const boundOnProgress = (progress: BatchProgress) =>
            onProgress(jobId, progress)

        // Run the executor
        const summary = await executor.execute(
            {
                id: dbJob.id,
                guildId: dbJob.guildId,
                totalItems: dbJob.totalItems,
                sourceChannelId: dbJob.sourceChannelId ?? undefined,
                targetChannelId: dbJob.targetChannelId ?? undefined,
                options: dbJob.options as Record<string, unknown>,
            },
            boundOnProgress,
        )

        // Handle completion state: distinguish between completed, cancelled, and paused
        if ((summary as Record<string, unknown>).cancelled) {
            await batchJobService.markCancelled(jobId)
        } else if ((summary as Record<string, unknown>).paused) {
            await batchJobService.markPaused(jobId)
        } else {
            await batchJobService.markCompleted(jobId)
        }
        await batchJobService.setSummary(jobId, summary)

        infoLog({
            message: 'Batch job completed successfully',
            data: { jobId, summary },
        })

        return summary
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error)

        errorLog({
            message: 'Batch job failed',
            error,
            data: { jobId },
        })

        // Guard the failure-marking itself: if it throws, log separately so the
        // original executor error is not obscured.
        try {
            await batchJobService.markFailed(jobId, errorMessage)
        } catch (markError) {
            errorLog({
                message: 'Failed to mark batch job as failed',
                error: markError,
                data: { jobId, originalError: errorMessage },
            })
        }

        // Re-throw to signal job failure to BullMQ
        throw error
    }
}

/**
 * Creates a dedicated BullMQ redis connection with maxRetriesPerRequest: null.
 * BullMQ strictly requires this setting to avoid connection state conflicts.
 */
function createBullMQRedisConnection(): Redis {
    // No try/catch: with lazyConnect the constructor never touches the
    // network — connection errors surface later through BullMQ's own
    // error handling, so a catch here would be a false safety net.
    return new Redis({
        host: ENVIRONMENT_CONFIG.REDIS.HOST,
        port: ENVIRONMENT_CONFIG.REDIS.PORT,
        password: ENVIRONMENT_CONFIG.REDIS.PASSWORD,
        db: ENVIRONMENT_CONFIG.REDIS.DB,
        // BullMQ requirement: must be null to avoid request queueing conflicts
        maxRetriesPerRequest: null,
        lazyConnect: true,
    })
}

/**
 * Starts the batch job worker (concurrency 1).
 * Must be called with an active Redis connection.
 * Gracefully handles Redis unavailability without crashing.
 */
export async function startBatchJobWorker(): Promise<void> {
    // Check that shared redis is available (signals connectivity)
    const sharedRedis = redisClient.getClient()
    if (!sharedRedis) {
        errorLog({
            message:
                'Cannot start batch job worker: Redis client not available',
        })
        return
    }

    // Create a dedicated redis connection for BullMQ with maxRetriesPerRequest: null
    bullmqRedis = createBullMQRedisConnection()

    // Register batch executors before consuming jobs. A lazy import keeps the
    // executor — which statically pulls in the bot client (bot/start) and DB
    // services — out of this module's static graph: it avoids an import cycle
    // (worker → executor → bot/start → initializer → worker) and keeps the
    // executor's import.meta-using deps out of unit-test import chains.
    try {
        const { ChannelMoveBatchExecutor } =
            await import('../functions/moderation/batch/channelMoveExecutor')
        registerExecutor(new ChannelMoveBatchExecutor())

        const { BulkKickExecutor } =
            await import('../functions/moderation/batch/bulkKickExecutor')
        registerExecutor(new BulkKickExecutor())

        const { BulkBanExecutor } =
            await import('../functions/moderation/batch/bulkBanExecutor')
        registerExecutor(new BulkBanExecutor())

        const { BulkWarnExecutor } =
            await import('../functions/moderation/batch/bulkWarnExecutor')
        registerExecutor(new BulkWarnExecutor())

        const { BulkAddRoleExecutor } =
            await import('../functions/moderation/batch/bulkAddRoleExecutor')
        registerExecutor(new BulkAddRoleExecutor())

        const { BulkRemoveRoleExecutor } =
            await import('../functions/moderation/batch/bulkRemoveRoleExecutor')
        registerExecutor(new BulkRemoveRoleExecutor())
    } catch (error) {
        errorLog({ message: 'Failed to register batch executors', error })
        // Clean up the bullmq redis connection on executor registration failure
        if (bullmqRedis) {
            await bullmqRedis.disconnect()
            bullmqRedis = null
        }
        return
    }

    try {
        worker = new Worker(QUEUE_NAME, processBatchJob, {
            connection: bullmqRedis,
            concurrency: 1,
        })

        worker.on('completed', (job) => {
            debugLog({
                message: 'Batch job completed',
                data: { jobId: job.id },
            })
        })

        worker.on('failed', (job, error) => {
            errorLog({
                message: 'Batch job failed in worker',
                error,
                data: { jobId: job?.id },
            })
        })

        infoLog({
            message: 'Batch job worker started',
        })
    } catch (error) {
        errorLog({
            message: 'Failed to start batch job worker',
            error,
        })
        // Clean up the bullmq redis connection on worker creation failure
        if (bullmqRedis) {
            try {
                await bullmqRedis.disconnect()
            } catch (disconnectError) {
                errorLog({
                    message:
                        'Error disconnecting BullMQ redis on startup failure',
                    error: disconnectError,
                })
            }
            bullmqRedis = null
        }
    }
}

/**
 * Stops the batch job worker gracefully.
 */
export async function stopBatchJobWorker(): Promise<void> {
    try {
        if (worker) {
            await worker.close()
        }
        infoLog({
            message: 'Batch job worker stopped',
        })
    } catch (error) {
        errorLog({
            message: 'Error stopping batch job worker',
            error,
        })
    } finally {
        // Always drop the worker reference and release the BullMQ redis
        // connection — a throwing worker.close() must not leave dead state
        worker = null
        if (bullmqRedis) {
            bullmqRedis.disconnect()
            bullmqRedis = null
        }
    }
}
