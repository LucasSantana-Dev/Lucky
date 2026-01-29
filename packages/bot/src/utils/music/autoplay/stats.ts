import { errorLog } from '@lukbot/shared/utils'
import { guildSettingsService, trackHistoryService } from '@lukbot/shared/services'

/**
 * Get autoplay statistics for a guild
 */
export async function getAutoplayStats(guildId: string): Promise<{
    total: number
    thisWeek: number
    thisMonth: number
    averagePerDay: number
}> {
    try {
        const counter = await guildSettingsService.getAutoplayCounter(guildId)
        const total = counter?.count ?? 0

        const history = await trackHistoryService.getTrackHistory(guildId, 100)
        const now = Date.now()
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000)
        const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000)

        const thisWeek = history.filter(entry => entry.timestamp > oneWeekAgo).length
        const thisMonth = history.filter(entry => entry.timestamp > oneMonthAgo).length
        const averagePerDay = thisWeek / 7

        return {
            total,
            thisWeek,
            thisMonth,
            averagePerDay,
        }
    } catch (error) {
        errorLog({ message: 'Error getting autoplay stats:', error })
        return {
            total: 0,
            thisWeek: 0,
            thisMonth: 0,
            averagePerDay: 0,
        }
    }
}

/**
 * Check if autoplay should be enabled for a guild
 */
export async function shouldEnableAutoplay(guildId: string): Promise<boolean> {
    try {
        const stats = await getAutoplayStats(guildId)

        // Enable autoplay if there's been recent activity
        return stats.thisWeek > 0 || stats.total > 5
    } catch (error) {
        errorLog({ message: 'Error checking autoplay eligibility:', error })
        return false
    }
}
