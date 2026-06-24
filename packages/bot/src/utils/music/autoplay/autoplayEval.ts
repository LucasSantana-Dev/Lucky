import type { Track } from 'discord-player'
import { calculateRecommendationScore } from './candidateScorer'

export type EvalSample = {
    seed: Track
    candidates: Array<{ track: Track; isPositive: boolean }>
    recentArtists?: Set<string>
    implicitDislikeKeys?: Set<string>
}

export function computeHitAtK(samples: EvalSample[], k: number): number {
    if (samples.length === 0) return 0

    let hits = 0

    for (const sample of samples) {
        // Score all candidates
        const scored = sample.candidates.map(({ track, isPositive }) => ({
            isPositive,
            score: calculateRecommendationScore({
                candidate: track,
                currentTrack: sample.seed,
                recentArtists: sample.recentArtists ?? new Set(),
                implicitDislikeKeys: sample.implicitDislikeKeys ?? new Set(),
            }).score,
        }))

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score)

        // Check if positive is in top-k
        const topK = scored.slice(0, k)
        if (topK.some((c) => c.isPositive)) hits++
    }

    return hits / samples.length
}
