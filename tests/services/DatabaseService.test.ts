/**
 * DatabaseService unit tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { DatabaseService } from '../../src/services/database/DatabaseService'
import { createMockConfig, createMockPrismaClient, expectResultSuccess, expectResultFailure } from '../utils/testHelpers'

describe('DatabaseService', () => {
  let databaseService: DatabaseService
  let mockPrismaClient: any
  let mockRedisClient: any

  beforeEach(() => {
    mockPrismaClient = createMockPrismaClient()
    mockRedisClient = createMockRedisClient()

    // Mock PrismaClient constructor
    jest.doMock('@prisma/client', () => ({
      PrismaClient: jest.fn(() => mockPrismaClient),
    }))

    databaseService = new DatabaseService(createMockConfig())
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('connect', () => {
    it('should connect successfully when not already connected', async () => {
      mockPrismaClient.$connect.mockResolvedValue(undefined)

      const result = await databaseService.connect()

      expectResultSuccess(result, true)
      expect(mockPrismaClient.$connect).toHaveBeenCalledTimes(1)
    })

    it('should return success when already connected', async () => {
      // Simulate already connected state
      ;(databaseService as any).isConnected = true

      const result = await databaseService.connect()

      expectResultSuccess(result, true)
      expect(mockPrismaClient.$connect).not.toHaveBeenCalled()
    })

    it('should handle connection errors gracefully', async () => {
      mockPrismaClient.$connect.mockRejectedValue(new Error('Connection failed'))

      const result = await databaseService.connect()

      expectResultFailure(result)
    })
  })

  describe('disconnect', () => {
    it('should disconnect successfully when connected', async () => {
      ;(databaseService as any).isConnected = true
      mockPrismaClient.$disconnect.mockResolvedValue(undefined)

      const result = await databaseService.disconnect()

      expectResultSuccess(result)
      expect(mockPrismaClient.$disconnect).toHaveBeenCalledTimes(1)
    })

    it('should return success when not connected', async () => {
      ;(databaseService as any).isConnected = false

      const result = await databaseService.disconnect()

      expectResultSuccess(result)
      expect(mockPrismaClient.$disconnect).not.toHaveBeenCalled()
    })
  })

  describe('isHealthy', () => {
    it('should return true when database is healthy', async () => {
      ;(databaseService as any).isConnected = true
      mockPrismaClient.$queryRaw.mockResolvedValue([{ result: 1 }])

      const result = await databaseService.isHealthy()

      expectResultSuccess(result, true)
    })

    it('should return false when not connected', async () => {
      ;(databaseService as any).isConnected = false

      const result = await databaseService.isHealthy()

      expectResultSuccess(result, false)
    })

    it('should handle health check errors', async () => {
      ;(databaseService as any).isConnected = true
      mockPrismaClient.$queryRaw.mockRejectedValue(new Error('Health check failed'))

      const result = await databaseService.isHealthy()

      expectResultFailure(result)
    })
  })

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const userData = {
        discordId: '123456789',
        username: 'testuser',
        avatar: 'https://example.com/avatar.png',
      }
      const mockUser = { id: 'user123', ...userData }

      mockPrismaClient.user.upsert.mockResolvedValue(mockUser)

      const result = await databaseService.createUser(
        userData.discordId,
        userData.username,
        userData.avatar
      )

      expectResultSuccess(result, mockUser)
      expect(mockPrismaClient.user.upsert).toHaveBeenCalledWith({
        where: { discordId: userData.discordId },
        update: { username: userData.username, avatar: userData.avatar },
        create: userData,
      })
    })

    it('should handle user creation errors', async () => {
      mockPrismaClient.user.upsert.mockRejectedValue(new Error('Database error'))

      const result = await databaseService.createUser('123', 'test', 'avatar')

      expectResultFailure(result, 'Failed to create/update user')
    })
  })

  describe('getUser', () => {
    it('should retrieve user successfully', async () => {
      const mockUser = {
        id: 'user123',
        discordId: '123456789',
        username: 'testuser',
        preferences: { preferredVolume: 50 },
      }

      mockPrismaClient.user.findUnique.mockResolvedValue(mockUser)

      const result = await databaseService.getUser('123456789')

      expectResultSuccess(result, mockUser)
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { discordId: '123456789' },
        include: { preferences: true },
      })
    })

    it('should return null when user not found', async () => {
      mockPrismaClient.user.findUnique.mockResolvedValue(null)

      const result = await databaseService.getUser('nonexistent')

      expectResultSuccess(result, null)
    })
  })

  describe('addTrackToHistory', () => {
    it('should add track to history successfully', async () => {
      const trackData = {
        guildId: 'guild123',
        trackId: 'track123',
        title: 'Test Track',
        author: 'Test Artist',
        duration: '3:30',
        url: 'https://youtube.com/watch?v=test',
        thumbnail: 'https://example.com/thumb.jpg',
        source: 'youtube',
        playedBy: 'user123',
        isAutoplay: false,
      }

      const mockTrack = { id: 'history123', ...trackData }
      mockPrismaClient.trackHistory.create.mockResolvedValue(mockTrack)

      const result = await databaseService.addTrackToHistory(trackData)

      expectResultSuccess(result, mockTrack)
      expect(mockPrismaClient.trackHistory.create).toHaveBeenCalledWith({
        data: {
          guild: { connect: { discordId: trackData.guildId } },
          trackId: trackData.trackId,
          title: trackData.title,
          author: trackData.author,
          duration: trackData.duration,
          url: trackData.url,
          thumbnail: trackData.thumbnail,
          source: trackData.source,
          playedBy: trackData.playedBy,
          isAutoplay: trackData.isAutoplay,
        },
      })
    })
  })

  describe('getTrackHistory', () => {
    it('should retrieve track history successfully', async () => {
      const mockTracks = [
        { id: '1', title: 'Track 1', author: 'Artist 1' },
        { id: '2', title: 'Track 2', author: 'Artist 2' },
      ]

      mockPrismaClient.trackHistory.findMany.mockResolvedValue(mockTracks)

      const result = await databaseService.getTrackHistory('guild123', 10)

      expectResultSuccess(result, mockTracks)
      expect(mockPrismaClient.trackHistory.findMany).toHaveBeenCalledWith({
        where: { guild: { discordId: 'guild123' } },
        orderBy: { playedAt: 'desc' },
        take: 10,
      })
    })
  })

  describe('recordCommandUsage', () => {
    it('should record command usage successfully', async () => {
      const usageData = {
        userId: 'user123',
        guildId: 'guild123',
        command: 'play',
        category: 'music',
        success: true,
        duration: 1500,
      }

      const mockUsage = { id: 'usage123', ...usageData }
      mockPrismaClient.commandUsage.create.mockResolvedValue(mockUsage)

      const result = await databaseService.recordCommandUsage(usageData)

      expectResultSuccess(result, mockUsage)
      expect(mockPrismaClient.commandUsage.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { discordId: usageData.userId } },
          guild: { connect: { discordId: usageData.guildId } },
          command: usageData.command,
          category: usageData.category,
          success: usageData.success,
          errorCode: usageData.errorCode,
          duration: usageData.duration,
        },
      })
    })
  })

  describe('checkRateLimit', () => {
    it('should allow request when under rate limit', async () => {
      const key = 'user:guild:command'
      const limit = 5
      const windowMs = 60000

      mockPrismaClient.rateLimit.findUnique.mockResolvedValue(null)

      const result = await databaseService.checkRateLimit(key, limit, windowMs)

      expectResultSuccess(result, true)
      expect(mockPrismaClient.rateLimit.upsert).toHaveBeenCalled()
    })

    it('should block request when over rate limit', async () => {
      const key = 'user:guild:command'
      const limit = 5
      const windowMs = 60000

      mockPrismaClient.rateLimit.findUnique.mockResolvedValue({
        key,
        count: 5,
        resetAt: new Date(Date.now() + 30000),
      })

      const result = await databaseService.checkRateLimit(key, limit, windowMs)

      expectResultSuccess(result, false)
    })
  })

  describe('getTopTracks', () => {
    it('should retrieve top tracks successfully', async () => {
      const mockTracks = [
        { trackId: 'track1', title: 'Track 1', author: 'Artist 1', _count: { trackId: 10 } },
        { trackId: 'track2', title: 'Track 2', author: 'Artist 2', _count: { trackId: 8 } },
      ]

      mockPrismaClient.trackHistory.groupBy.mockResolvedValue(mockTracks)

      const result = await databaseService.getTopTracks('guild123', 10)

      expectResultSuccess(result, mockTracks)
      expect(mockPrismaClient.trackHistory.groupBy).toHaveBeenCalledWith({
        by: ['trackId', 'title', 'author'],
        where: { guild: { discordId: 'guild123' } },
        _count: { trackId: true },
        orderBy: { _count: { trackId: 'desc' } },
        take: 10,
      })
    })
  })

  describe('cleanupOldData', () => {
    it('should cleanup old data successfully', async () => {
      mockPrismaClient.trackHistory.deleteMany.mockResolvedValue({ count: 100 })
      mockPrismaClient.commandUsage.deleteMany.mockResolvedValue({ count: 50 })
      mockPrismaClient.rateLimit.deleteMany.mockResolvedValue({ count: 25 })

      const result = await databaseService.cleanupOldData()

      expectResultSuccess(result, 175)
      expect(mockPrismaClient.trackHistory.deleteMany).toHaveBeenCalled()
      expect(mockPrismaClient.commandUsage.deleteMany).toHaveBeenCalled()
      expect(mockPrismaClient.rateLimit.deleteMany).toHaveBeenCalled()
    })
  })
})
