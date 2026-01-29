import type { Track } from 'discord-player'
import type { TrackVector, RecommendationConfig } from './types'
import { extractTags, extractGenre } from '../../utils/music/duplicateDetection/tagExtractor'

export function createTrackVector(track: Track): TrackVector {
  const tags = extractTags(track)
  const genre = extractGenre(track)

  return {
    trackId: track.id || track.url,
    title: track.title,
    artist: track.author,
    genre,
    tags,
    duration:
      typeof track.duration === 'number'
        ? track.duration
        : parseInt(track.duration.toString(), 10),
    views: track.views,
    vector: createFeatureVector(track, tags, genre),
  }
}

function createFeatureVector(track: Track, tags: string[], genre?: string): number[] {
  const vector: number[] = []

  vector.push(track.title.length / 100)
  vector.push(track.title.toLowerCase().includes('remix') ? 1 : 0)
  vector.push(track.title.toLowerCase().includes('cover') ? 1 : 0)

  vector.push(track.author.length / 50)
  vector.push(track.author.toLowerCase().includes('feat') ? 1 : 0)

  const duration =
    typeof track.duration === 'number'
      ? track.duration
      : parseInt(track.duration.toString(), 10)
  vector.push(Math.min(duration / 300000, 1))
  vector.push(duration < 120000 ? 1 : 0)

  if (genre) {
    vector.push(1)
    vector.push(genre.length / 20)
  } else {
    vector.push(0, 0)
  }

  vector.push(Math.min(tags.length / 10, 1))
  vector.push(tags.some((tag) => tag.includes('instrumental')) ? 1 : 0)
  vector.push(tags.some((tag) => tag.includes('acoustic')) ? 1 : 0)

  vector.push(track.views ? Math.min(track.views / 1000000, 1) : 0)

  return vector
}

export function calculateCosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    return 0
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i]
    normA += vectorA[i] * vectorA[i]
    normB += vectorB[i] * vectorB[i]
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function calculateEuclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    return Infinity
  }

  let sum = 0
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i]
    sum += diff * diff
  }

  return Math.sqrt(sum)
}

export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))

  if (magnitude === 0) {
    return vector
  }

  return vector.map((val) => val / magnitude)
}

export function calculateVectorSimilarity(
  vectorA: TrackVector,
  vectorB: TrackVector,
  _config: RecommendationConfig,
): number {
  const cosineSim = calculateCosineSimilarity(vectorA.vector, vectorB.vector)

  let genreBonus = 0
  if (vectorA.genre && vectorB.genre && vectorA.genre === vectorB.genre) {
    genreBonus = 0.2
  }

  return Math.min(cosineSim + genreBonus, 1.0)
}
