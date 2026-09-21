export * from './types'
export * from './tagExtractor'
export * from './similarityChecker'
export * from './duplicateChecker'

export {
    checkForDuplicate,
    addTrackToHistory,
    getTrackMetadata,
} from './duplicateChecker'
export { extractTags, extractGenre } from './tagExtractor'
export { areTracksSimilar, calculateSimilarityScore } from './similarityChecker'

export const isDuplicateTrack = async (
    _guildId: string,
    _trackUrl: string,
): Promise<boolean> => {
    return false
}

export const clearHistory = async (_guildId: string): Promise<void> => {
    void _guildId
}

export const clearAllGuildCaches = async (_guildId: string): Promise<void> => {
    void _guildId
}

export {
    recentlyPlayedTracks,
    trackIdSet,
    lastPlayedTracks,
    artistGenreMap,
} from './types'
export type { TrackHistoryEntry, TrackMetadata } from './types'
