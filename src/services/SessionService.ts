/**
 * SessionService - Direct implementation without over-abstraction
 */

import { redisClient } from '../config/redis'
import { infoLog, errorLog } from '../utils/general/log'

export interface UserSession {
  userId: string
  guildId: string
  lastActivity: Date
  commandHistory: string[]
  preferences: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface QueueSession {
  guildId: string
  currentTrack: unknown | null
  queuePosition: number
  isPlaying: boolean
  isPaused: boolean
  volume: number
  repeatMode: number
  shuffleEnabled: boolean
  queue: unknown[]
  queueHistory: unknown[]
  createdAt: Date
  updatedAt: Date
}

export class SessionService {
  private readonly ttl: number

  constructor(ttl = 24 * 60 * 60) { // 24 hours
    this.ttl = ttl
  }

  private getRedisKey(type: string, guildId: string, userId?: string): string {
    return userId
      ? `session:${type}:${guildId}:${userId}`
      : `session:${type}:${guildId}`
  }

  // User Session Methods
  async createUserSession(session: UserSession): Promise<boolean> {
    try {
      const sessionData = {
        ...session,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await redisClient.setex(
        this.getRedisKey('user', session.guildId, session.userId),
        this.ttl,
        JSON.stringify(sessionData)
      )

      infoLog({ message: `Created user session for ${session.userId} in guild ${session.guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to create user session', error })
      return false
    }
  }

  async getUserSession(userId: string, guildId: string): Promise<UserSession | null> {
    try {
      const sessionData = await redisClient.get(this.getRedisKey('user', guildId, userId))
      if (!sessionData) {
        return null
      }
      return JSON.parse(sessionData) as UserSession
    } catch (error) {
      errorLog({ message: 'Failed to get user session', error })
      return null
    }
  }

  async updateUserSession(session: UserSession): Promise<boolean> {
    try {
      const updatedSession = {
        ...session,
        updatedAt: new Date(),
      }

      await redisClient.setex(
        this.getRedisKey('user', session.guildId, session.userId),
        this.ttl,
        JSON.stringify(updatedSession)
      )

      infoLog({ message: `Updated user session for ${session.userId} in guild ${session.guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to update user session', error })
      return false
    }
  }

  async deleteUserSession(userId: string, guildId: string): Promise<boolean> {
    try {
      await redisClient.del(this.getRedisKey('user', guildId, userId))
      infoLog({ message: `Deleted user session for ${userId} in guild ${guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to delete user session', error })
      return false
    }
  }

  async addCommandToHistory(userId: string, guildId: string, command: string): Promise<boolean> {
    try {
      const session = await this.getUserSession(userId, guildId)
      if (!session) {
        return false
      }

      session.commandHistory.push(command)
      if (session.commandHistory.length > 10) {
        session.commandHistory = session.commandHistory.slice(-10)
      }

      session.lastActivity = new Date()
      return await this.updateUserSession(session)
    } catch (error) {
      errorLog({ message: 'Failed to add command to history', error })
      return false
    }
  }

  async updateUserPreferences(userId: string, guildId: string, preferences: Record<string, unknown>): Promise<boolean> {
    try {
      const session = await this.getUserSession(userId, guildId)
      if (!session) {
        return false
      }

      session.preferences = { ...session.preferences, ...preferences }
      session.lastActivity = new Date()
      return await this.updateUserSession(session)
    } catch (error) {
      errorLog({ message: 'Failed to update user preferences', error })
      return false
    }
  }

  // Queue Session Methods
  async createQueueSession(session: QueueSession): Promise<boolean> {
    try {
      const sessionData = {
        ...session,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await redisClient.setex(
        this.getRedisKey('queue', session.guildId),
        this.ttl,
        JSON.stringify(sessionData)
      )

      infoLog({ message: `Created queue session for guild ${session.guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to create queue session', error })
      return false
    }
  }

  async getQueueSession(guildId: string): Promise<QueueSession | null> {
    try {
      const sessionData = await redisClient.get(this.getRedisKey('queue', guildId))
      if (!sessionData) {
        return null
      }
      return JSON.parse(sessionData) as QueueSession
    } catch (error) {
      errorLog({ message: 'Failed to get queue session', error })
      return null
    }
  }

  async updateQueueSession(session: QueueSession): Promise<boolean> {
    try {
      const updatedSession = {
        ...session,
        updatedAt: new Date(),
      }

      await redisClient.setex(
        this.getRedisKey('queue', session.guildId),
        this.ttl,
        JSON.stringify(updatedSession)
      )

      infoLog({ message: `Updated queue session for guild ${session.guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to update queue session', error })
      return false
    }
  }

  async deleteQueueSession(guildId: string): Promise<boolean> {
    try {
      await redisClient.del(this.getRedisKey('queue', guildId))
      infoLog({ message: `Deleted queue session for guild ${guildId}` })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to delete queue session', error })
      return false
    }
  }

  async updateQueuePosition(guildId: string, position: number): Promise<boolean> {
    try {
      const session = await this.getQueueSession(guildId)
      if (!session) {
        return false
      }

      session.queuePosition = position
      session.updatedAt = new Date()
      return await this.updateQueueSession(session)
    } catch (error) {
      errorLog({ message: 'Failed to update queue position', error })
      return false
    }
  }

  async updatePlayingState(guildId: string, isPlaying: boolean): Promise<boolean> {
    try {
      const session = await this.getQueueSession(guildId)
      if (!session) {
        return false
      }

      session.isPlaying = isPlaying
      session.updatedAt = new Date()
      return await this.updateQueueSession(session)
    } catch (error) {
      errorLog({ message: 'Failed to update playing state', error })
      return false
    }
  }

  async updateVolume(guildId: string, volume: number): Promise<boolean> {
    try {
      const session = await this.getQueueSession(guildId)
      if (!session) {
        return false
      }

      session.volume = Math.max(0, Math.min(100, volume))
      session.updatedAt = new Date()
      return await this.updateQueueSession(session)
    } catch (error) {
      errorLog({ message: 'Failed to update volume', error })
      return false
    }
  }

  async updateRepeatMode(guildId: string, repeatMode: number): Promise<boolean> {
    try {
      const session = await this.getQueueSession(guildId)
      if (!session) {
        return false
      }

      session.repeatMode = repeatMode
      session.updatedAt = new Date()
      return await this.updateQueueSession(session)
    } catch (error) {
      errorLog({ message: 'Failed to update repeat mode', error })
      return false
    }
  }

  async updateShuffleState(guildId: string, shuffleEnabled: boolean): Promise<boolean> {
    try {
      const session = await this.getQueueSession(guildId)
      if (!session) {
        return false
      }

      session.shuffleEnabled = shuffleEnabled
      session.updatedAt = new Date()
      return await this.updateQueueSession(session)
    } catch (error) {
      errorLog({ message: 'Failed to update shuffle state', error })
      return false
    }
  }

  // Utility Methods
  async getActiveSessions(guildId: string): Promise<{ userSessions: number; hasQueueSession: boolean }> {
    try {
      const userSessions = await redisClient.keys(this.getRedisKey('user', guildId, '*'))
      const queueSession = await this.getQueueSession(guildId)

      return {
        userSessions: userSessions.length,
        hasQueueSession: queueSession !== null,
      }
    } catch (error) {
      errorLog({ message: 'Failed to get active sessions', error })
      return { userSessions: 0, hasQueueSession: false }
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      // Redis TTL handles this automatically, but we can clean up manually if needed
      const allKeys = await redisClient.keys('session:*')
      let cleanedCount = 0

      for (const key of allKeys) {
        const ttl = await redisClient.ttl(key)
        if (ttl === -1) { // No expiration set
          await redisClient.del(key)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        infoLog({ message: `Cleaned up ${cleanedCount} expired sessions` })
      }

      return cleanedCount
    } catch (error) {
      errorLog({ message: 'Failed to cleanup expired sessions', error })
      return 0
    }
  }
}
