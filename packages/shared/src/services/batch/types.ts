/**
 * Batch operations shared types and interfaces.
 */

/** Represents a scope configuration for filtering messages/users in a batch operation. */
export interface ScopeConfig {
    type: 'all' | 'count' | 'user' | 'date_range' | 'contains'
    config: {
        count?: number
        userId?: string
        dateRangeStart?: Date | string
        dateRangeEnd?: Date | string
        searchText?: string
    }
}

/** Union of all supported batch job types. */
export type BatchJobType =
    | 'channel_move_batch'
    | 'bulk_ban'
    | 'bulk_kick'
    | 'bulk_warn'
    | 'bulk_add_role'
    | 'bulk_remove_role'
    | 'purge_batch'

/** Union of all valid batch job statuses. */
export type BatchJobStatus =
    'pending' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled'

/** Represents the progress state of a batch job. */
export interface BatchProgress {
    processed: number
    failed: number
    skipped: number
    total: number
    percentComplete: number
    eta?: string
    message: string
    /**
     * Resumability checkpoint: the cursor (last successfully processed target id)
     * to persist. Executors MUST report this via `onProgress` BEFORE the destructive
     * step so a crash/restart resumes from here without re-processing or duplicating.
     */
    nextCursor?: string
}

/** Executor interface for a specific batch job type. */
export interface BatchJobExecutor {
    jobType: BatchJobType

    /**
     * Estimates the number of minutes required to complete a job.
     * Called before job execution for progress reporting.
     */
    estimateMinutes(job: {
        totalItems: number
        options?: Record<string, unknown>
    }): number

    /**
     * Executes the batch job with live progress callbacks.
     *
     * @param job The batch job to execute
     * @param onProgress Resumability checkpoint + progress callback. The executor MUST
     *   `await` this with the updated `nextCursor` BEFORE performing the destructive step
     *   on the current item (e.g. deleting the source message). The callback persists the
     *   checkpoint to the DB, so awaiting it first guarantees a crash/restart resumes
     *   without re-processing or duplicating that item. Returns a Promise — never
     *   fire-and-forget.
     * @returns A summary object detailing the operation result
     */
    execute(
        job: {
            id: string
            guildId: string
            totalItems: number
            sourceChannelId?: string
            targetChannelId?: string
            options?: Record<string, unknown>
        },
        onProgress: (progress: BatchProgress) => Promise<void>,
    ): Promise<Record<string, unknown>>
}
