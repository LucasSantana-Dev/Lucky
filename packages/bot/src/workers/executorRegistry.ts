/**
 * Registry for batch job executors.
 * Maps job types to their respective executor implementations.
 */

import type {
    BatchJobType,
    BatchJobExecutor,
} from '@lucky/shared/services/batch'

const executorMap = new Map<BatchJobType, BatchJobExecutor>()

/**
 * Registers a batch job executor for a specific job type.
 * @param executor The executor implementation.
 */
export function registerExecutor(executor: BatchJobExecutor): void {
    executorMap.set(executor.jobType, executor)
}

/**
 * Retrieves a registered executor for a job type.
 * @param jobType The batch job type.
 * @returns The executor, or null if not registered.
 */
export function getExecutor(jobType: BatchJobType): BatchJobExecutor | null {
    return executorMap.get(jobType) ?? null
}

/**
 * Checks if an executor is registered for a job type.
 */
export function hasExecutor(jobType: BatchJobType): boolean {
    return executorMap.has(jobType)
}
