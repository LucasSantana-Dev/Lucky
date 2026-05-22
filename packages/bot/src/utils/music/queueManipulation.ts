import {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from './autoplay/candidateCollector'
import { collectLastFmCandidates } from './autoplay/lastFmSeeder'
import { replenishQueue } from './autoplay/replenisher'
import { calculateRecommendationScore } from './autoplay/candidateScorer'
import { getTrackAudioFeatures } from './autoplay/audioFeatures'

export { collectLastFmCandidates }
export { replenishQueue }
export {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
}
export { calculateRecommendationScore }
export { getTrackAudioFeatures }

export * from './trackNormalization'
export * from './queueEditOps'
export * from './candidateFallback'
export * from './queueRescue'
