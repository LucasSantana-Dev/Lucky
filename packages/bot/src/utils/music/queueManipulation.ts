import {
    collectRecommendationCandidates,
    shouldIncludeCandidate,
    upsertScoredCandidate,
    type ScoredTrack,
} from '../../services/musicRecommendation/autoplay/candidateCollector'
import { collectLastFmCandidates } from '../../services/musicRecommendation/autoplay/lastFmSeeder'
import { replenishQueue } from '../../services/musicRecommendation/autoplay/replenisher'
import { calculateRecommendationScore } from '../../services/musicRecommendation/autoplay/candidateScorer'
import { getTrackAudioFeatures } from '../../services/musicRecommendation/autoplay/audioFeatures'

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
export * from '../../services/musicRecommendation/candidateFallback'
export * from './queueRescue'
