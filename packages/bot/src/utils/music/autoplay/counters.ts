import { debugLog, errorLog } from '@lukbot/shared/utils'
import { guildSettingsService } from '@lukbot/shared/services'

export const autoplayCounters = new Map<string, number>()

export async function getAutoplayCount(guildId: string): Promise<number> {
  try {
    const redisCount = await guildSettingsService.getAutoplayCounter(guildId)
    if (redisCount) {
      return redisCount.count
    }
    return autoplayCounters.get(guildId) ?? 0
  } catch (error) {
    errorLog({ message: 'Error getting autoplay count:', error })
    return autoplayCounters.get(guildId) ?? 0
  }
}

export async function incrementAutoplayCount(
  guildId: string,
  increment: number = 1,
): Promise<number> {
  try {
    await guildSettingsService.incrementAutoplayCounter(guildId)

    const currentCount = autoplayCounters.get(guildId) ?? 0
    const newCount = currentCount + increment
    autoplayCounters.set(guildId, newCount)

    debugLog({
      message: `Incremented autoplay count for guild ${guildId}`,
      data: { newCount },
    })

    return newCount
  } catch (error) {
    errorLog({ message: 'Error incrementing autoplay count:', error })
    return autoplayCounters.get(guildId) ?? 0
  }
}

export async function resetAutoplayCount(guildId: string): Promise<void> {
  try {
    await guildSettingsService.resetAutoplayCounter(guildId)

    autoplayCounters.set(guildId, 0)

    debugLog({
      message: `Reset autoplay count for guild ${guildId}`,
    })
  } catch (error) {
    errorLog({ message: 'Error resetting autoplay count:', error })
  }
}

export async function clearAllAutoplayCounters(): Promise<void> {
  try {
    autoplayCounters.clear()
    await guildSettingsService.clearAllAutoplayCounters()
    debugLog({ message: 'Cleared all autoplay counters' })
  } catch (error) {
    errorLog({ message: 'Error clearing autoplay counters:', error })
  }
}
