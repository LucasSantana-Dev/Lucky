import type { Track } from 'discord-player'

export type TrackVector = {
  trackId: string
  title: string
  artist: string
  genre?: string
  tags: string[]
  duration: number
  views?: number
  vector: number[]
}

export type RecommendationConfig = {
  maxRecommendations: number
  similarityThreshold: number
  genreWeight: number
  tagWeight: number
  artistWeight: number
  durationWeight: number
  popularityWeight: number
  diversityFactor: number
}

export type RecommendationResult = {
  track: Track
  score: number
  reasons: string[]
}

export type UserPreferenceSeed = {
  genres: string[]
  artists: string[]
  avgDuration: number
}

export type RecommendationContext = {
  guildId: string
  userId?: string
  currentTrack?: Track
  recentHistory: Track[]
  availableTracks: Track[]
  config: RecommendationConfig
}
