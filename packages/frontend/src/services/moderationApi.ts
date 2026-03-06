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
        updateCase: (
            guildId: string,
            caseNumber: number,
            data: Partial<Pick<ModerationCase, 'reason' | 'active'>>,
        ) =>
            apiClient.patch<{ case: ModerationCase }>(
                `/guilds/${guildId}/moderation/cases/${caseNumber}`,
                data,
            ),
        deleteCase: (guildId: string, caseNumber: number) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/moderation/cases/${caseNumber}`,
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
            apiClient.post<{ settings: ModerationSettings }>(
                `/guilds/${guildId}/moderation/settings`,
                settings,
            ),
        getUserHistory: (guildId: string, userId: string) =>
            apiClient.get<{ cases: ModerationCase[] }>(
                `/guilds/${guildId}/moderation/users/${userId}/history`,
            ),
    }
}
