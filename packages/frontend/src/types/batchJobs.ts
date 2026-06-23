export type BatchJobStatus =
    | 'pending'
    | 'in_progress'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled'

export type BatchJobItemStatus = 'pending' | 'success' | 'skipped' | 'failed'

export interface BatchJob {
    id: string
    guildId: string
    jobType: string
    status: BatchJobStatus
    initiatedBy: string
    sourceChannelId?: string
    targetChannelId?: string
    scope: Record<string, unknown>
    options?: Record<string, unknown>
    totalItems: number
    processedItems: number
    failedItems: number
    skippedItems: number
    estimatedMinutes?: number
    nextCursor?: string
    summary?: Record<string, unknown>
    createdAt: string
    startedAt?: string
    completedAt?: string
    lastProgressAt?: string
}

export interface BatchJobItem {
    id: string
    jobId: string
    targetId: string
    status: BatchJobItemStatus
    error?: string
    attemptedAt?: string
    resultMetadata?: Record<string, unknown>
}

export interface BatchProgress {
    jobId: string
    processedItems: number
    totalItems: number
    failedItems: number
    skippedItems: number
    lastUpdated: string
}
