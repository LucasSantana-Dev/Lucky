export {
    autoplayCounters,
    getAutoplayCount,
    incrementAutoplayCount,
    resetAutoplayCount,
    clearAllAutoplayCounters,
} from './counters'

export {
    getAutoplayRecommendations,
    getRecommendationConfig,
} from './recommendations'

export { getAutoplayStats, shouldEnableAutoplay } from './stats'

export {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './candidateCollector'
