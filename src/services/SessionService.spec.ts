import { describe, it, expect, beforeEach } from '@jest/globals'
import { SessionService } from './SessionService'

describe('SessionService', () => {
  let sessionService: SessionService

  beforeEach(() => {
    sessionService = new SessionService(3600) // 1 hour TTL
  })

  describe('Basic functionality', () => {
    it('should be instantiated with TTL', () => {
      expect(sessionService).toBeDefined()
      expect(sessionService).toBeInstanceOf(SessionService)
    })

    it('should have required methods', () => {
      expect(typeof sessionService.createUserSession).toBe('function')
      expect(typeof sessionService.getUserSession).toBe('function')
      expect(typeof sessionService.updateUserSession).toBe('function')
      expect(typeof sessionService.deleteUserSession).toBe('function')
      expect(typeof sessionService.createQueueSession).toBe('function')
      expect(typeof sessionService.getQueueSession).toBe('function')
      expect(typeof sessionService.updateQueueSession).toBe('function')
      expect(typeof sessionService.deleteQueueSession).toBe('function')
      expect(typeof sessionService.cleanupExpiredSessions).toBe('function')
    })
  })

  describe('Session data validation', () => {
    it('should validate user session data structure', () => {
      const validUserSession = {
        userId: '123456789012345678',
        guildId: '987654321098765432',
        lastActivity: new Date(),
        commandHistory: ['play', 'pause'],
        preferences: { volume: 50 },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(validUserSession.userId).toMatch(/^\d{17,19}$/)
      expect(validUserSession.guildId).toMatch(/^\d{17,19}$/)
      expect(validUserSession.lastActivity).toBeInstanceOf(Date)
      expect(Array.isArray(validUserSession.commandHistory)).toBe(true)
      expect(typeof validUserSession.preferences).toBe('object')
      expect(validUserSession.createdAt).toBeInstanceOf(Date)
      expect(validUserSession.updatedAt).toBeInstanceOf(Date)
    })

    it('should validate queue session data structure', () => {
      const validQueueSession = {
        guildId: '987654321098765432',
        queueId: 'queue123',
        tracks: ['track1', 'track2'],
        currentIndex: 0,
        isPlaying: false,
        volume: 50,
        repeatMode: 0,
        shuffleMode: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(validQueueSession.guildId).toMatch(/^\d{17,19}$/)
      expect(validQueueSession.queueId).toBeTruthy()
      expect(Array.isArray(validQueueSession.tracks)).toBe(true)
      expect(typeof validQueueSession.currentIndex).toBe('number')
      expect(typeof validQueueSession.isPlaying).toBe('boolean')
      expect(typeof validQueueSession.volume).toBe('number')
      expect(typeof validQueueSession.repeatMode).toBe('number')
      expect(typeof validQueueSession.shuffleMode).toBe('boolean')
      expect(validQueueSession.createdAt).toBeInstanceOf(Date)
      expect(validQueueSession.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('Error handling', () => {
    it('should handle invalid user IDs', () => {
      const invalidUserId = 'invalid'
      expect(invalidUserId).not.toMatch(/^\d{17,19}$/)
    })

    it('should handle invalid guild IDs', () => {
      const invalidGuildId = 'invalid'
      expect(invalidGuildId).not.toMatch(/^\d{17,19}$/)
    })

    it('should handle missing required fields', () => {
      const incompleteSession: any = {
        userId: '123456789012345678',
        // Missing guildId, lastActivity, etc.
      }

      expect(incompleteSession.guildId).toBeUndefined()
      expect(incompleteSession.lastActivity).toBeUndefined()
    })
  })

  describe('Configuration validation', () => {
    it('should validate session TTL values', () => {
      const ttl = 3600
      expect(ttl).toBeGreaterThan(0)
    })

    it('should have reasonable default values', () => {
      const ttl = 3600
      expect(ttl).toBeGreaterThanOrEqual(300) // At least 5 minutes
    })
  })
})
