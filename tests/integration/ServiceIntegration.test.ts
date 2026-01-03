/**
 * Service integration tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

// Mock DatabaseService entirely
jest.mock('../../src/services/database/DatabaseService', () => ({
  DatabaseService: jest.fn().mockImplementation(() => ({
    createUser: jest.fn(),
    getUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    createGuild: jest.fn(),
    getGuild: jest.fn(),
    updateGuild: jest.fn(),
    deleteGuild: jest.fn(),
    createTrackHistory: jest.fn(),
    getTrackHistory: jest.fn(),
    updateTrackHistory: jest.fn(),
    deleteTrackHistory: jest.fn(),
    createCommandUsage: jest.fn(),
    getCommandUsage: jest.fn(),
    updateCommandUsage: jest.fn(),
    deleteCommandUsage: jest.fn(),
    createAnalytics: jest.fn(),
    getAnalytics: jest.fn(),
    updateAnalytics: jest.fn(),
    deleteAnalytics: jest.fn(),
    createArtistStats: jest.fn(),
    getArtistStats: jest.fn(),
    updateArtistStats: jest.fn(),
    deleteArtistStats: jest.fn(),
    isHealthy: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
}))
import { DatabaseService } from '../../src/services/database/DatabaseService'
import { TrackHistoryService } from '../../src/services/trackHistory'
import { GuildSettingsService } from '../../src/services/guildSettings'
import { SessionService } from '../../src/services/session'
import { createMockTrackHistoryConfig, createMockTrack, createMockRedisClient, createMockDatabaseConfig, createMockSessionConfig, createMockServiceConfig } from '../utils/testHelpers'

describe('Service Integration Tests', () => {
  let databaseService: DatabaseService
  let trackHistoryService: TrackHistoryService
  let guildSettingsService: GuildSettingsService
  let sessionService: SessionService
  let mockRedisClient: any

  beforeEach(() => {
    mockRedisClient = createMockRedisClient()

    // Initialize services
    databaseService = new DatabaseService(createMockDatabaseConfig())
    trackHistoryService = new TrackHistoryService(createMockTrackHistoryConfig(), mockRedisClient)
    guildSettingsService = new GuildSettingsService(createMockServiceConfig(), mockRedisClient)
    sessionService = new SessionService(createMockSessionConfig(), mockRedisClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Database and Track History Integration', () => {
    it('should work together for track history management', async () => {
      const mockTrack = createMockTrack()
      const guildId = 'guild123'
      // const userId = 'user123'

      // Mock database operations
      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.trackHistory.create.mockResolvedValue({
        id: 'history123',
        trackId: mockTrack.id,
        title: mockTrack.title,
        author: mockTrack.author,
      })

      // Test adding track to history
      const addResult = await trackHistoryService.addTrackToHistory(mockTrack, guildId)
      expect(addResult.isSuccess()).toBe(true)

      // Test retrieving track history
      const historyResult = await trackHistoryService.getTrackHistory(guildId, 10)
      expect(historyResult.isSuccess()).toBe(true)
    })

    it('should handle database connection failures gracefully', async () => {
      const mockTrack = createMockTrack()
      const guildId = 'guild123'

      // Mock database connection failure
      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.trackHistory.create.mockRejectedValue(new Error('Database connection failed'))

      // Service should handle the error gracefully
      const result = await trackHistoryService.addTrackToHistory(mockTrack, guildId)
      expect(result.isFailure()).toBe(true)
    })
  })

  describe('Guild Settings and Session Integration', () => {
    it('should manage guild settings and user sessions together', async () => {
      const guildId = 'guild123'
      // const userId = 'user123'

      // Test guild settings
      const settingsResult = await guildSettingsService.getGuildSettings(guildId)
      expect(settingsResult.isSuccess()).toBe(true)

      // Test user session
      const sessionResult = await sessionService.createUserSession({
        userId: 'user123',
        guildId: 'guild123',
        channelId: 'channel123',
        lastActivity: Date.now(),
        commandHistory: [],
        preferences: {},
      })
      expect(sessionResult.isSuccess()).toBe(true)
    })

    it('should handle Redis connection failures', async () => {
      const guildId = 'guild123'
      // const userId = 'user123'

      // Mock Redis failure
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'))

      // Services should handle Redis failures gracefully
      const settingsResult = await guildSettingsService.getGuildSettings(guildId)
      expect(settingsResult.isSuccess()).toBe(true) // Should return fallback

      const sessionResult = await sessionService.createUserSession({
        userId: 'user123',
        guildId: 'guild123',
        channelId: 'channel123',
        lastActivity: Date.now(),
        commandHistory: [],
        preferences: {},
      })
      expect(sessionResult.isSuccess()).toBe(true) // Should return fallback
    })
  })

  describe('Service Health Checks', () => {
    it('should check database health', async () => {
      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.$queryRaw.mockResolvedValue([{ result: 1 }])

      const healthResult = await databaseService.isHealthy()
      expect(healthResult.isSuccess()).toBe(true)
      expect(healthResult.getData()).toBe(true)
    })

    it('should handle database health check failures', async () => {
      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.$queryRaw.mockRejectedValue(new Error('Database unavailable'))

      const healthResult = await databaseService.isHealthy()
      expect(healthResult.isFailure()).toBe(true)
    })
  })

  describe('Error Handling and Fallbacks', () => {
    it('should provide fallback values when services fail', async () => {
      const guildId = 'guild123'

      // Mock all services to fail
      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.trackHistory.findMany.mockRejectedValue(new Error('Database error'))
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'))

      // Services should return fallback values
      const historyResult = await trackHistoryService.getTrackHistory(guildId)
      expect(historyResult.isSuccess()).toBe(true)
      expect(historyResult.getData()).toEqual([]) // Empty array fallback

      const settingsResult = await guildSettingsService.getGuildSettings(guildId)
      expect(settingsResult.isSuccess()).toBe(true)
      expect(settingsResult.getData()).toBeNull() // Null fallback
    })

    it('should log errors appropriately', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.trackHistory.create.mockRejectedValue(new Error('Database error'))

      await trackHistoryService.addTrackToHistory(createMockTrack(), 'guild123')

      // Should log the error
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('Performance and Resource Management', () => {
    it('should handle concurrent requests', async () => {
      const guildId = 'guild123'
      const promises = []

      // Create multiple concurrent requests
      for (let i = 0; i < 10; i++) {
        promises.push(trackHistoryService.getTrackHistory(guildId))
      }

      const results = await Promise.all(promises)

      // All requests should succeed
      results.forEach(result => {
        expect(result.isSuccess()).toBe(true)
      })
    })

    it('should clean up resources properly', async () => {
      // Test database disconnection
      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.$disconnect.mockResolvedValue(undefined)

      const disconnectResult = await databaseService.disconnect()
      expect(disconnectResult.isSuccess()).toBe(true)
      expect(mockPrismaClient.$disconnect).toHaveBeenCalled()
    })
  })

  describe('Data Consistency', () => {
    it('should maintain data consistency across services', async () => {
      const guildId = 'guild123'
      // const userId = 'user123'
      const mockTrack = createMockTrack()

      // Mock consistent data across services
      const mockPrismaClient = (databaseService as any).prisma
      mockPrismaClient.trackHistory.create.mockResolvedValue({
        id: 'history123',
        guildId,
        trackId: mockTrack.id,
        title: mockTrack.title,
      })

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        guildId,
        settings: { defaultVolume: 50 },
      }))

      // All services should work with consistent data
      const trackResult = await trackHistoryService.addTrackToHistory(mockTrack, guildId)
      const settingsResult = await guildSettingsService.getGuildSettings(guildId)

      expect(trackResult.isSuccess()).toBe(true)
      expect(settingsResult.isSuccess()).toBe(true)
    })
  })
})
