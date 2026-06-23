/**
 * BullMQ queue wrapper for batch job operations.
 * Provides enqueueBatchJob utility with graceful degradation if Redis is unavailable.
 */

import { Queue, type Job } from 'bullmq'
import { redisClient } from '@lucky/shared/services'
import { warnLog, errorLog } from '@lucky/shared/utils'

const QUEUE_NAME = 'batch-jobs'
let queue: Queue | null = null

/**
 * Initializes or returns the batch job queue.
 * Returns null if Redis is not available; warn but don't fail.
 */
function getQueue(): Queue | null {
    if (queue) return queue

    const redis = redisClient.getClient()
    if (!redis) {
        warnLog({
            message:
                'Redis client not available; batch operations disabled (will not enqueue jobs)',
        })
        return null
    }

    try {
        queue = new Queue(QUEUE_NAME, { connection: redis })
        return queue
    } catch (error) {
        errorLog({
            message: 'Failed to initialize batch job queue',
            error,
        })
        return null
    }
}

/**
 * Enqueues a batch job by ID.
 * Gracefully no-ops and warns if Redis is unavailable.
 * @param jobId The ID of the batch job to enqueue.
 */
export async function enqueueBatchJob(jobId: string): Promise<Job | null> {
    const q = getQueue()
    if (!q) {
        warnLog({
            message: 'Redis unavailable; batch job not enqueued',
            data: { jobId },
        })
        return null
    }

    try {
        const job = await q.add(jobId, { jobId }, { jobId })
        return job
    } catch (error) {
        errorLog({
            message: 'Failed to enqueue batch job',
            error,
            data: { jobId },
        })
        return null
    }
}

/**
 * Returns the batch job queue instance (or null if unavailable).
 * Used by the worker to consume jobs.
 */
export function getBatchQueue(): Queue | null {
    return getQueue()
}
