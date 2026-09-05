import type { AxiosInstance } from 'axios'

export interface RecommendationSummary {
    totalPicks: number
    accepted: number
    rejected: number
    pending: number
    globalAcceptanceRate: number | null
}

export interface RecommendationSourceAcceptance {
    source: string | null
    count: number
    acceptedCount: number
    rejectedCount: number
    pendingCount: number
    acceptanceRate: number | null
}

export interface RecommendationHistory {
    summary: RecommendationSummary
    perSource: RecommendationSourceAcceptance[]
}

export function createRecommendationsApi(client: AxiosInstance) {
    return {
        getHistory: (guildId: string, days?: number) =>
            client.get<RecommendationHistory>(
                `/guilds/${guildId}/recommendations/history`,
                days ? { params: { days } } : undefined,
            ),
    }
}
