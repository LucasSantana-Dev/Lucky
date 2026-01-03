/**
 * Database types for PostgreSQL operations
 */

export interface DatabaseUser {
  id: string
  discordId: string
  username: string
  avatar?: string
  createdAt: Date
  updatedAt: Date
}

export interface DatabaseGuild {
  id: string
  discordId: string
  name: string
  icon?: string
  ownerId: string
  createdAt: Date
  updatedAt: Date
}

export interface DatabaseTrackHistory {
  id: string
  guildId: string
  trackId: string
  title: string
  author: string
  duration: string
  url: string
  thumbnail: string | null
  source: string
  playedAt: Date
  createdAt: Date
  playedBy: string | null
  isAutoplay: boolean
  playlistName: string | null
  playDuration: number | null
  skipped: boolean | null
  isPlaylist: boolean | null
}

export interface DatabaseCommandUsage {
  id: string
  userId: string | null
  guildId: string | null
  command: string
  category: string
  success: boolean
  errorCode: string | null
  duration: number | null
  createdAt: Date
}

export interface DatabaseRateLimit {
  id: string
  key: string
  count: number
  resetAt: Date
  createdAt: Date
}

export interface DatabaseAnalytics {
  trackId: string
  title: string
  author: string
  playCount: number
}

export interface DatabaseArtistStats {
  author: string
  playCount: number
}
