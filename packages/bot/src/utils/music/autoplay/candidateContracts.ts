import type { Track } from 'discord-player'
import { debugLog } from '@lucky/shared/utils'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'
import type {
    RecommendationBasis,
    RecommendationSource,
    RecommendationSignal,
} from './recommendationBasis.js'
import { serializeBasis } from './recommendationBasis.js'
import { normalizeTrackKey } from './scoringUtils'
import { isDuplicateCandidate } from './diversitySelector'

/**
 * Include a candidate in the pool if it hasn't been played recently
 * and isn't in the disliked set.
 */
export function shouldIncludeCandidate(
    track: Track,
    excludedUrls: Set<string>,
    excludedKeys: Set<string>,
): boolean {
    return !isDuplicateCandidate(track, excludedUrls, excludedKeys)
}

/**
 * Add or update a candidate in the scored pool.
 * Keeps the higher-scored version if a duplicate key exists.
 *
 * Non-finite scores (e.g. the cross-locale `-Infinity` hard-reject from
 * `calculateRecommendationScore`) are dropped here so callers don't need to
 * remember the in-place guard before every call. Any per-source boost
 * (`+ LASTFM_SCORE_BOOST`, `* match`, `+ GENRE_SCORE_BOOST`) that runs on a
 * `-Infinity` base stays non-finite, so this gate covers the boosted-score
 * caller patterns too.
 */
export function upsertScoredCandidate(
    candidates: Map<string, ScoredTrack>,
    candidate: Track,
    scored: {
        score: number
        source: RecommendationSource
        signals: RecommendationSignal[]
    },
    auditCollector?: AutoplayAuditCollector,
): void {
    if (!Number.isFinite(scored.score)) {
        debugLog({
            message: 'Autoplay hard-reject',
            data: {
                title: candidate.title,
                author: candidate.author,
                score: scored.score,
                source: scored.source,
                note: 'empty signals indicate hard-reject at scorer stage (blocked artist, too long, ambient noise, edm mix, spanish locale, disliked, or cross-genre drift)',
            },
        })
        const basis: RecommendationBasis = {
            source: scored.source,
            signals: scored.signals,
        }
        auditCollector?.recordEvaluated(
            candidate,
            scored.score,
            serializeBasis(basis),
            'rejected',
        )
        return
    }

    const basis: RecommendationBasis = {
        source: scored.source,
        signals: scored.signals,
    }
    const normalizedKey = normalizeTrackKey(candidate.title, candidate.author)
    const candidateKey =
        normalizedKey !== '::'
            ? normalizedKey
            : candidate.id ||
              candidate.url ||
              normalizeTrackKey(candidate.title, candidate.author)
    const existing = candidates.get(candidateKey)

    if (!existing || scored.score > existing.score) {
        candidates.set(candidateKey, {
            track: candidate,
            score: scored.score,
            basis,
        })
        auditCollector?.recordEvaluated(
            candidate,
            scored.score,
            serializeBasis(basis),
            'accepted',
        )
    }
}
