/**
 * TrackHistoryService - Direct implementation without over-abstraction
 */

import { redisClient } from '../config/redis'
import { infoLog, errorLog } from '../utils/general/log'
import type { Track } from 'discord-player'

export interface TrackHistoryEntry {
  trackId: string
  title: string
  author: string
  duration: string
  url: string
  timestamp: number
  guildId: string
  playedBy?: string
  isAutoplay?: boolean
}

export interface TrackHistoryStats {
  totalTracks: number
  totalPlayTime: number
  topArtists: Array<{ artist: string; plays: number }>
  topTracks: Array<{ trackId: string; title: string; plays: number }>
  lastUpdated: Date
}

export class TrackHistoryService {
  private readonly ttl: number
  private readonly maxHistorySize: number

  constructor(ttl = 7 * 24 * 60 * 60, maxHistorySize = 100) {
    this.ttl = ttl
    this.maxHistorySize = maxHistorySize
  }

  private getRedisKey(guildId: string, trackId?: string): string {
    return trackId
      ? `track_history:${guildId}:${trackId}`
      : `track_history:${guildId}`
  }

  async addTrackToHistory(track: Track, guildId: string, playedBy?: string): Promise<boolean> {
    try {
      const entry: TrackHistoryEntry = {
        trackId: track.id,
        title: track.title,
        author: track.author,
        duration: track.duration,
        url: track.url,
        timestamp: Date.now(),
        guildId,
        playedBy,
        isAutoplay: Boolean((track.metadata as { isAutoplay?: boolean })?.isAutoplay ?? false),
      }

      // Store individual track
      await redisClient.setex(
        this.getRedisKey(guildId, track.id),
        this.ttl,
        JSON.stringify(entry)
      )

      // Add to guild history list
      await redisClient.lpush(this.getRedisKey(guildId), JSON.stringify(entry))
      await redisClient.ltrim(this.getRedisKey(guildId), 0, this.maxHistorySize - 1)
      await redisClient.expire(this.getRedisKey(guildId), this.ttl)

      infoLog({ message: `Added track to history: ${track.title} in guild ${guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to add track to history', error })
      return false
    }
  }

  async getTrackHistory(guildId: string, limit = 10): Promise<TrackHistoryEntry[]> {
    try {
      const historyData = await redisClient.lrange(this.getRedisKey(guildId), 0, limit - 1)
      return historyData.map(data => JSON.parse(data) as TrackHistoryEntry)
    } catch (error) {
      errorLog({ message: 'Failed to get track history', error })
      return []
    }
  }

  async getLastTrack(guildId: string): Promise<TrackHistoryEntry | null> {
    try {
      const lastTrackData = await redisClient.lindex(this.getRedisKey(guildId), 0)
      return lastTrackData ? JSON.parse(lastTrackData) as TrackHistoryEntry : null
    } catch (error) {
      errorLog({ message: 'Failed to get last track', error })
      return null
    }
  }

  async clearHistory(guildId: string): Promise<boolean> {
    try {
      await redisClient.del(this.getRedisKey(guildId))
      infoLog({ message: `Cleared track history for guild ${guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to clear track history', error })
      return false
    }
  }

  async isDuplicateTrack(guildId: string, trackUrl: string, _timeWindow = 300000): Promise<boolean> {
    try {
      const history = await this.getTrackHistory(guildId, 20)
      const cutoffTime = Date.now() - _timeWindow

      return history.some(entry =>
        entry.url === trackUrl && entry.timestamp > cutoffTime
      )
    } catch (error) {
      errorLog({ message: 'Failed to check for duplicate track', error })
      return false
    }
  }

  async getTopTracks(guildId: string, limit = 10): Promise<Array<{ trackId: string; title: string; plays: number }>> {
    try {
      const history = await this.getTrackHistory(guildId, 100)
      const trackCounts = new Map<string, { title: string; count: number }>()

      history.forEach(entry => {
        const current = trackCounts.get(entry.trackId) || { title: entry.title, count: 0 }
        trackCounts.set(entry.trackId, { ...current, count: current.count + 1 })
      })

      return Array.from(trackCounts.entries())
        .map(([trackId, data]) => ({ trackId, title: data.title, plays: data.count }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, limit)
    } catch (error) {
      errorLog({ message: 'Failed to get top tracks', error })
      return []
    }
  }

  async getTopArtists(guildId: string, limit = 10): Promise<Array<{ artist: string; plays: number }>> {
    try {
      const history = await this.getTrackHistory(guildId, 100)
      const artistCounts = new Map<string, number>()

      history.forEach(entry => {
        const current = artistCounts.get(entry.author) || 0
        artistCounts.set(entry.author, current + 1)
      })

      return Array.from(artistCounts.entries())
        .map(([artist, plays]) => ({ artist, plays }))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, limit)
    } catch (error) {
      errorLog({ message: 'Failed to get top artists', error })
      return []
    }
  }

  async generateStats(guildId: string): Promise<TrackHistoryStats | null> {
    try {
      const history = await this.getTrackHistory(guildId, 100)

      if (history.length === 0) {
        return null
      }

      const totalTracks = history.length
      const totalPlayTime = history.reduce((total, entry) => {
        const duration = this.parseDuration(entry.duration)
        return total + duration
      }, 0)

      const topArtists = await this.getTopArtists(guildId, 5)
      const topTracks = await this.getTopTracks(guildId, 5)

      return {
        totalTracks,
        totalPlayTime,
        topArtists,
        topTracks,
        lastUpdated: new Date(),
      }
    } catch (error) {
      errorLog({ message: 'Failed to generate stats', error })
      return null
    }
  }

  private parseDuration(duration: string): number {
    // Parse duration string like "3:30" to seconds
    const parts = duration.split(':')
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1])
    }
    return 0
  }

  async cleanupOldData(): Promise<number> {
    // Redis TTL handles cleanup automatically
    // Return 0 as no manual cleanup is needed
    return 0
  }

  async markTrackAsPlayed(guildId: string, trackUrl: string): Promise<void> {
    try {
      const key = this.getRedisKey(guildId, `played:${trackUrl}`)
      await redisClient.setex(key, 300, Date.now().toString()) // 5 minutes TTL
    } catch (error) {
      errorLog({ message: 'Failed to mark track as played', error })
    }
  }

  async clearAllGuildCaches(guildId: string): Promise<void> {
    try {
      const pattern = this.getRedisKey(guildId, '*')
      const keys = await redisClient.keys(pattern)
      if (keys.length > 0) {
        for (const key of keys) {
          await redisClient.del(key)
        }
      }
    } catch (error) {
      errorLog({ message: 'Failed to clear guild caches', error })
    }
  }
}

export const trackHistoryService = new TrackHistoryService()
