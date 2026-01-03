export * from './types'
export * from './tagExtractor'
export * from './similarityChecker'
export * from './duplicateChecker'

// Main functions for backward compatibility
export {
    checkForDuplicate,
    addTrackToHistory,
    getTrackMetadata,
} from './duplicateChecker'
export { extractTags, extractGenre } from './tagExtractor'
export { areTracksSimilar, calculateSimilarityScore } from './similarityChecker'

import { ServiceFactory } from '../../../services/ServiceFactory'

export const isDuplicateTrack = async (guildId: string, trackUrl: string): Promise<boolean> => {
    const trackHistoryService = ServiceFactory.getTrackHistoryService()
    return await trackHistoryService.isDuplicateTrack(guildId, trackUrl)
}

export const clearHistory = async (guildId: string): Promise<void> => {
    const trackHistoryService = ServiceFactory.getTrackHistoryService()
    await trackHistoryService.clearHistory(guildId)
}

export const clearAllGuildCaches = async (guildId: string): Promise<void> => {
    const trackHistoryService = ServiceFactory.getTrackHistoryService()
    await trackHistoryService.clearAllGuildCaches(guildId)
}

// Legacy exports for backward compatibility
export {
    recentlyPlayedTracks,
    trackIdSet,
    lastPlayedTracks,
    artistGenreMap,
} from './types'
export type { TrackHistoryEntry, TrackMetadata } from './types'
