import type { AxiosInstance } from 'axios'
import type { BatchJob, BatchJobItem, BatchProgress } from '@/types'

export interface BatchJobFilters {
    status?: string
    limit?: number
    offset?: number
}

export function createBatchJobsApi(apiClient: AxiosInstance) {
    return {
        list: (guildId: string, filters?: BatchJobFilters) =>
            apiClient.get<{ jobs: BatchJob[] }>(
                `/guilds/${guildId}/batch-jobs`,
                { params: filters },
            ),
        get: (guildId: string, jobId: string) =>
            apiClient.get<{ job: BatchJob & { items: BatchJobItem[] } }>(
                `/guilds/${guildId}/batch-jobs/${jobId}`,
            ),
        getProgress: (guildId: string, jobId: string) =>
            apiClient.get<{ progress: BatchProgress | null }>(
                `/guilds/${guildId}/batch-jobs/${jobId}/progress`,
            ),
        cancel: (guildId: string, jobId: string) =>
            apiClient.post<{ job: BatchJob }>(
                `/guilds/${guildId}/batch-jobs/${jobId}/cancel`,
            ),
    }
}
