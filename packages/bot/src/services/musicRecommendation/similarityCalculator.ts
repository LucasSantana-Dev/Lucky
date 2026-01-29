import type { Track } from 'discord-player'
import type { RecommendationConfig } from './types'

export function calculateTrackSimilarity(
  trackA: Track,
  trackB: Track,
  config: RecommendationConfig,
): number {
  const similarity = {
    title: calculateTitleSimilarity(trackA.title, trackB.title),
    artist: calculateArtistSimilarity(trackA.author, trackB.author),
    genre: calculateGenreSimilarity(trackA, trackB),
    duration: calculateDurationSimilarity(
      typeof trackA.duration === 'number' ? trackA.duration : parseInt(trackA.duration.toString(), 10),
      typeof trackB.duration === 'number' ? trackB.duration : parseInt(trackB.duration.toString(), 10),
    ),
    tags: calculateTagSimilarity(trackA, trackB),
  }

  return (
    similarity.title * 0.2 +
    similarity.artist * config.artistWeight +
    similarity.genre * config.genreWeight +
    similarity.duration * config.durationWeight +
    similarity.tags * config.tagWeight
  )
}

function calculateTitleSimilarity(titleA: string, titleB: string): number {
  const normalizedA = titleA.toLowerCase().trim()
  const normalizedB = titleB.toLowerCase().trim()

  if (normalizedA === normalizedB) {
    return 1.0
  }

  const wordsA = normalizedA.split(/\s+/)
  const wordsB = normalizedB.split(/\s+/)
  const commonWords = wordsA.filter((word) => wordsB.includes(word))

  if (commonWords.length === 0) {
    return 0.0
  }

  const union = new Set([...wordsA, ...wordsB])
  return commonWords.length / union.size
}

function calculateArtistSimilarity(artistA: string, artistB: string): number {
  const normalizedA = artistA.toLowerCase().trim()
  const normalizedB = artistB.toLowerCase().trim()

  if (normalizedA === normalizedB) {
    return 1.0
  }

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 0.8
  }

  const wordsA = normalizedA.split(/\s+/)
  const wordsB = normalizedB.split(/\s+/)
  const commonWords = wordsA.filter((word) => wordsB.includes(word))

  if (commonWords.length > 0) {
    return Math.min(commonWords.length / Math.max(wordsA.length, wordsB.length), 0.6)
  }

  return 0.0
}

function calculateGenreSimilarity(_trackA: Track, _trackB: Track): number {
  return 0.5
}

function calculateDurationSimilarity(durationA: number, durationB: number): number {
  if (durationA === 0 || durationB === 0) {
    return 0.5
  }
  const ratio = Math.min(durationA, durationB) / Math.max(durationA, durationB)
  return ratio
}

function calculateTagSimilarity(_trackA: Track, _trackB: Track): number {
  return 0.3
}

export function calculateDiversityScore(
  recommendations: Track[],
  config: RecommendationConfig,
): number {
  if (recommendations.length <= 1) {
    return 1.0
  }

  let totalSimilarity = 0
  let comparisons = 0

  for (let i = 0; i < recommendations.length; i++) {
    for (let j = i + 1; j < recommendations.length; j++) {
      const similarity = calculateTrackSimilarity(
        recommendations[i],
        recommendations[j],
        config,
      )
      totalSimilarity += similarity
      comparisons++
    }
  }

  const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0
  return 1.0 - avgSimilarity
}
