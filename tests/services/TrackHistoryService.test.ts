/**
 * TrackHistoryService unit tests
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { TrackHistoryService } from '../../src/services/trackHistory'
import { createMockServiceConfig, createMockTrack, expectResultSuccess, expectResultFailure } from '../utils/testHelpers'

// Mock the managers
jest.mock('../../src/services/trackHistory/historyManager', () => ({
  HistoryManager: jest.fn().mockImplementation(() => ({
    addTrackToHistory: jest.fn(),
    getTrackHistory: jest.fn(),
    getLastTrack: jest.fn(),
    clearHistory: jest.fn(),
  })),
}))

jest.mock('../../src/services/trackHistory/metadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    storeTrackMetadata: jest.fn(),
    getTrackMetadata: jest.fn(),
    updateTrackViews: jest.fn(),
    getPopularTracks: jest.fn(),
    clearGuildMetadata: jest.fn(),
  })),
}))

jest.mock('../../src/services/trackHistory/duplicateDetector', () => ({
  DuplicateDetector: jest.fn().mockImplementation(() => ({
    isDuplicateTrack: jest.fn(),
    markTrackAsPlayed: jest.fn(),
    findSimilarTracks: jest.fn(),
    clearGuildCache: jest.fn(),
  })),
}))

jest.mock('../../src/services/trackHistory/analytics', () => ({
  TrackAnalytics: jest.fn().mockImplementation(() => ({
    generateStats: jest.fn(),
    getCachedStats: jest.fn(),
    getTopArtists: jest.fn(),
    clearGuildCache: jest.fn(),
  })),
}))

describe('TrackHistoryService', () => {
  let trackHistoryService: TrackHistoryService
  let mockRedisClient: any
  let mockConfig: any

  beforeEach(() => {
    mockRedisClient = createMockRedisClient()
    mockConfig = createMockServiceConfig()

    trackHistoryService = new TrackHistoryService(mockConfig, mockRedisClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('addTrackToHistory', () => {
    it('should add track to history successfully', async () => {
      const mockTrack = createMockTrack()
      const guildId = 'guild123'

      // Mock the history manager to succeed
      const historyManager = (trackHistoryService as any).historyManager
      historyManager.addTrackToHistory.mockResolvedValue(undefined)

      const result = await trackHistoryService.addTrackToHistory(mockTrack, guildId)

      expectResultSuccess(result)
      expect(historyManager.addTrackToHistory).toHaveBeenCalledWith(mockTrack, guildId)
    })

    it('should handle errors gracefully with fallback', async () => {
      const mockTrack = createMockTrack()
      const guildId = 'guild123'

      // Mock the history manager to fail
      const historyManager = (trackHistoryService as any).historyManager
      historyManager.addTrackToHistory.mockRejectedValue(new Error('History manager error'))

      const result = await trackHistoryService.addTrackToHistory(mockTrack, guildId)

      expectResultFailure(result, 'Failed to add track to history')
    })
  })

  describe('getTrackHistory', () => {
    it('should retrieve track history successfully', async () => {
      const guildId = 'guild123'
      const limit = 10
      const mockHistory = [
        { id: '1', title: 'Track 1', author: 'Artist 1' },
        { id: '2', title: 'Track 2', author: 'Artist 2' },
      ]

      const historyManager = (trackHistoryService as any).historyManager
      historyManager.getTrackHistory.mockResolvedValue(mockHistory)

      const result = await trackHistoryService.getTrackHistory(guildId, limit)

      expectResultSuccess(result, mockHistory)
      expect(historyManager.getTrackHistory).toHaveBeenCalledWith(guildId, limit)
    })

    it('should return empty array on error', async () => {
      const guildId = 'guild123'

      const historyManager = (trackHistoryService as any).historyManager
      historyManager.getTrackHistory.mockRejectedValue(new Error('History manager error'))

      const result = await trackHistoryService.getTrackHistory(guildId)

      expectResultSuccess(result, [])
    })
  })

  describe('getLastTrack', () => {
    it('should retrieve last track successfully', async () => {
      const guildId = 'guild123'
      const mockLastTrack = { id: '1', title: 'Last Track', author: 'Artist' }

      const historyManager = (trackHistoryService as any).historyManager
      historyManager.getLastTrack.mockResolvedValue(mockLastTrack)

      const result = await trackHistoryService.getLastTrack(guildId)

      expectResultSuccess(result, mockLastTrack)
      expect(historyManager.getLastTrack).toHaveBeenCalledWith(guildId)
    })

    it('should return null on error', async () => {
      const guildId = 'guild123'

      const historyManager = (trackHistoryService as any).historyManager
      historyManager.getLastTrack.mockRejectedValue(new Error('History manager error'))

      const result = await trackHistoryService.getLastTrack(guildId)

      expectResultSuccess(result, null)
    })
  })

  describe('clearHistory', () => {
    it('should clear history successfully', async () => {
      const guildId = 'guild123'

      const historyManager = (trackHistoryService as any).historyManager
      historyManager.clearHistory.mockResolvedValue(undefined)

      const result = await trackHistoryService.clearHistory(guildId)

      expectResultSuccess(result)
      expect(historyManager.clearHistory).toHaveBeenCalledWith(guildId)
    })

    it('should handle errors gracefully', async () => {
      const guildId = 'guild123'

      const historyManager = (trackHistoryService as any).historyManager
      historyManager.clearHistory.mockRejectedValue(new Error('History manager error'))

      const result = await trackHistoryService.clearHistory(guildId)

      expectResultFailure(result, 'Failed to clear history')
    })
  })

  describe('storeTrackMetadata', () => {
    it('should store track metadata successfully', async () => {
      const trackId = 'track123'
      const metadata = { views: 100, likes: 50, isAutoplay: false }

      const metadataManager = (trackHistoryService as any).metadataManager
      metadataManager.storeTrackMetadata.mockResolvedValue(undefined)

      const result = await trackHistoryService.storeTrackMetadata(trackId, metadata)

      expectResultSuccess(result)
      expect(metadataManager.storeTrackMetadata).toHaveBeenCalledWith(trackId, metadata)
    })
  })

  describe('getTrackMetadata', () => {
    it('should retrieve track metadata successfully', async () => {
      const trackId = 'track123'
      const mockMetadata = { views: 100, likes: 50, isAutoplay: false }

      const metadataManager = (trackHistoryService as any).metadataManager
      metadataManager.getTrackMetadata.mockResolvedValue(mockMetadata)

      const result = await trackHistoryService.getTrackMetadata(trackId)

      expectResultSuccess(result, mockMetadata)
      expect(metadataManager.getTrackMetadata).toHaveBeenCalledWith(trackId)
    })

    it('should return null on error', async () => {
      const trackId = 'track123'

      const metadataManager = (trackHistoryService as any).metadataManager
      metadataManager.getTrackMetadata.mockRejectedValue(new Error('Metadata manager error'))

      const result = await trackHistoryService.getTrackMetadata(trackId)

      expectResultSuccess(result, null)
    })
  })

  describe('updateTrackViews', () => {
    it('should update track views successfully', async () => {
      const trackId = 'track123'
      const increment = 5

      const metadataManager = (trackHistoryService as any).metadataManager
      metadataManager.updateTrackViews.mockResolvedValue(undefined)

      const result = await trackHistoryService.updateTrackViews(trackId, increment)

      expectResultSuccess(result)
      expect(metadataManager.updateTrackViews).toHaveBeenCalledWith(trackId, increment)
    })
  })

  describe('getPopularTracks', () => {
    it('should retrieve popular tracks successfully', async () => {
      const guildId = 'guild123'
      const limit = 10
      const mockTracks = [
        { trackId: 'track1', views: 1000 },
        { trackId: 'track2', views: 800 },
      ]

      const metadataManager = (trackHistoryService as any).metadataManager
      metadataManager.getPopularTracks.mockResolvedValue(mockTracks)

      const result = await trackHistoryService.getPopularTracks(guildId, limit)

      expectResultSuccess(result, mockTracks)
      expect(metadataManager.getPopularTracks).toHaveBeenCalledWith(guildId, limit)
    })

    it('should return empty array on error', async () => {
      const guildId = 'guild123'

      const metadataManager = (trackHistoryService as any).metadataManager
      metadataManager.getPopularTracks.mockRejectedValue(new Error('Metadata manager error'))

      const result = await trackHistoryService.getPopularTracks(guildId)

      expectResultSuccess(result, [])
    })
  })

  describe('isDuplicateTrack', () => {
    it('should check for duplicate tracks successfully', async () => {
      const guildId = 'guild123'
      const trackUrl = 'https://youtube.com/watch?v=test'
      const timeWindow = 300000

      const duplicateDetector = (trackHistoryService as any).duplicateDetector
      duplicateDetector.isDuplicateTrack.mockResolvedValue(false)

      const result = await trackHistoryService.isDuplicateTrack(guildId, trackUrl, timeWindow)

      expectResultSuccess(result, false)
      expect(duplicateDetector.isDuplicateTrack).toHaveBeenCalledWith(guildId, trackUrl, timeWindow)
    })

    it('should return false on error', async () => {
      const guildId = 'guild123'
      const trackUrl = 'https://youtube.com/watch?v=test'

      const duplicateDetector = (trackHistoryService as any).duplicateDetector
      duplicateDetector.isDuplicateTrack.mockRejectedValue(new Error('Duplicate detector error'))

      const result = await trackHistoryService.isDuplicateTrack(guildId, trackUrl)

      expectResultSuccess(result, false)
    })
  })

  describe('markTrackAsPlayed', () => {
    it('should mark track as played successfully', async () => {
      const guildId = 'guild123'
      const trackUrl = 'https://youtube.com/watch?v=test'

      const duplicateDetector = (trackHistoryService as any).duplicateDetector
      duplicateDetector.markTrackAsPlayed.mockResolvedValue(undefined)

      const result = await trackHistoryService.markTrackAsPlayed(guildId, trackUrl)

      expectResultSuccess(result)
      expect(duplicateDetector.markTrackAsPlayed).toHaveBeenCalledWith(guildId, trackUrl)
    })
  })

  describe('findSimilarTracks', () => {
    it('should find similar tracks successfully', async () => {
      const guildId = 'guild123'
      const trackTitle = 'Test Track'
      const limit = 5
      const mockSimilarTracks = [
        { id: '1', title: 'Similar Track 1', author: 'Artist 1' },
        { id: '2', title: 'Similar Track 2', author: 'Artist 2' },
      ]

      const duplicateDetector = (trackHistoryService as any).duplicateDetector
      duplicateDetector.findSimilarTracks.mockResolvedValue(mockSimilarTracks)

      const result = await trackHistoryService.findSimilarTracks(guildId, trackTitle, limit)

      expectResultSuccess(result, mockSimilarTracks)
      expect(duplicateDetector.findSimilarTracks).toHaveBeenCalledWith(guildId, trackTitle, limit)
    })

    it('should return empty array on error', async () => {
      const guildId = 'guild123'
      const trackTitle = 'Test Track'

      const duplicateDetector = (trackHistoryService as any).duplicateDetector
      duplicateDetector.findSimilarTracks.mockRejectedValue(new Error('Duplicate detector error'))

      const result = await trackHistoryService.findSimilarTracks(guildId, trackTitle)

      expectResultSuccess(result, [])
    })
  })

  describe('generateStats', () => {
    it('should generate stats successfully', async () => {
      const guildId = 'guild123'
      const mockStats = {
        totalTracks: 100,
        totalPlayTime: 3600,
        topArtists: ['Artist 1', 'Artist 2'],
        topTracks: ['Track 1', 'Track 2'],
      }

      const analytics = (trackHistoryService as any).analytics
      analytics.generateStats.mockResolvedValue(mockStats)

      const result = await trackHistoryService.generateStats(guildId)

      expectResultSuccess(result, mockStats)
      expect(analytics.generateStats).toHaveBeenCalledWith(guildId)
    })

    it('should handle errors gracefully', async () => {
      const guildId = 'guild123'

      const analytics = (trackHistoryService as any).analytics
      analytics.generateStats.mockRejectedValue(new Error('Analytics error'))

      const result = await trackHistoryService.generateStats(guildId)

      expectResultFailure(result, 'Failed to generate stats')
    })
  })

  describe('getCachedStats', () => {
    it('should retrieve cached stats successfully', async () => {
      const guildId = 'guild123'
      const mockCachedStats = {
        totalTracks: 50,
        totalPlayTime: 1800,
        lastUpdated: new Date(),
      }

      const analytics = (trackHistoryService as any).analytics
      analytics.getCachedStats.mockResolvedValue(mockCachedStats)

      const result = await trackHistoryService.getCachedStats(guildId)

      expectResultSuccess(result, mockCachedStats)
      expect(analytics.getCachedStats).toHaveBeenCalledWith(guildId)
    })

    it('should return null on error', async () => {
      const guildId = 'guild123'

      const analytics = (trackHistoryService as any).analytics
      analytics.getCachedStats.mockRejectedValue(new Error('Analytics error'))

      const result = await trackHistoryService.getCachedStats(guildId)

      expectResultSuccess(result, null)
    })
  })

  describe('getTopArtists', () => {
    it('should retrieve top artists successfully', async () => {
      const guildId = 'guild123'
      const limit = 10
      const mockArtists = [
        { artist: 'Artist 1', plays: 50 },
        { artist: 'Artist 2', plays: 30 },
      ]

      const analytics = (trackHistoryService as any).analytics
      analytics.getTopArtists.mockResolvedValue(mockArtists)

      const result = await trackHistoryService.getTopArtists(guildId, limit)

      expectResultSuccess(result, mockArtists)
      expect(analytics.getTopArtists).toHaveBeenCalledWith(guildId, limit)
    })

    it('should return empty array on error', async () => {
      const guildId = 'guild123'

      const analytics = (trackHistoryService as any).analytics
      analytics.getTopArtists.mockRejectedValue(new Error('Analytics error'))

      const result = await trackHistoryService.getTopArtists(guildId)

      expectResultSuccess(result, [])
    })
  })

  describe('clearAllGuildCaches', () => {
    it('should clear all guild caches successfully', async () => {
      const guildId = 'guild123'

      const historyManager = (trackHistoryService as any).historyManager
      const metadataManager = (trackHistoryService as any).metadataManager
      const duplicateDetector = (trackHistoryService as any).duplicateDetector
      const analytics = (trackHistoryService as any).analytics

      historyManager.clearHistory.mockResolvedValue(undefined)
      metadataManager.clearGuildMetadata.mockResolvedValue(undefined)
      duplicateDetector.clearGuildCache.mockResolvedValue(undefined)
      analytics.clearGuildCache.mockResolvedValue(undefined)

      const result = await trackHistoryService.clearAllGuildCaches(guildId)

      expectResultSuccess(result)
      expect(historyManager.clearHistory).toHaveBeenCalledWith(guildId)
      expect(metadataManager.clearGuildMetadata).toHaveBeenCalledWith(guildId)
      expect(duplicateDetector.clearGuildCache).toHaveBeenCalledWith(guildId)
      expect(analytics.clearGuildCache).toHaveBeenCalledWith(guildId)
    })

    it('should handle errors gracefully', async () => {
      const guildId = 'guild123'

      const historyManager = (trackHistoryService as any).historyManager
      historyManager.clearHistory.mockRejectedValue(new Error('History manager error'))

      const result = await trackHistoryService.clearAllGuildCaches(guildId)

      expectResultFailure(result, 'Failed to clear guild caches')
    })
  })
})
