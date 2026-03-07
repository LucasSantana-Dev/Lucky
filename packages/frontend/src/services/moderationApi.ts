import type { AxiosInstance } from 'axios'
import type {
    ModerationCase,
    ModerationSettings,
    ModerationStats,
    ModerationActionType,
} from '@/types'

export interface ModerationCaseFilters {
    page?: number
    limit?: number
    type?: ModerationActionType
    userId?: string
    moderatorId?: string
    active?: boolean
    search?: string
}

export function createModerationApi(apiClient: AxiosInstance) {
    return {
        getCases: (guildId: string, filters?: ModerationCaseFilters) =>
            apiClient.get<{ cases: ModerationCase[]; total: number }>(
                `/guilds/${guildId}/moderation/cases`,
                { params: filters },
            ),
        getCase: (guildId: string, caseNumber: number) =>
            apiClient.get<{ case: ModerationCase }>(
                `/guilds/${guildId}/moderation/cases/${caseNumber}`,
            ),
        updateReason: (guildId: string, caseNumber: number, reason: string) =>
            apiClient.patch<{ success: boolean }>(
                `/guilds/${guildId}/moderation/cases/${caseNumber}/reason`,
                { reason },
            ),
        deactivateCase: (guildId: string, caseId: string) =>
            apiClient.post<ModerationCase>(
                `/guilds/${guildId}/moderation/cases/${caseId}/deactivate`,
            ),
        getStats: (guildId: string) =>
            apiClient.get<{ stats: ModerationStats }>(
                `/guilds/${guildId}/moderation/stats`,
            ),
        getSettings: (guildId: string) =>
            apiClient.get<{ settings: ModerationSettings }>(
                `/guilds/${guildId}/moderation/settings`,
            ),
        updateSettings: (
            guildId: string,
            settings: Partial<ModerationSettings>,
        ) =>
            apiClient.patch<{ settings: ModerationSettings }>(
                `/guilds/${guildId}/moderation/settings`,
                settings,
            ),
        getUserCases: (guildId: string, userId: string, activeOnly?: boolean) =>
            apiClient.get<{ cases: ModerationCase[] }>(
                `/guilds/${guildId}/moderation/users/${userId}/cases`,
                { params: activeOnly ? { activeOnly: 'true' } : {} },
            ),
    }
}
