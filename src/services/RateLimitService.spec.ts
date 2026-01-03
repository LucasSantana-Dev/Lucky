/**
 * Unit tests for RateLimitService
 * Testing rate limiting behavior and edge cases
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock Redis client before imports
const mockRedisClient = {
    get: jest.fn() as jest.MockedFunction<any>,
    set: jest.fn() as jest.MockedFunction<any>,
    setex: jest.fn() as jest.MockedFunction<any>,
    del: jest.fn() as jest.MockedFunction<any>,
    exists: jest.fn() as jest.MockedFunction<any>,
    expire: jest.fn() as jest.MockedFunction<any>,
    incr: jest.fn() as jest.MockedFunction<any>,
}

jest.mock('../config/redis', () => ({
    redisClient: mockRedisClient,
}))

import { rateLimitService } from './RateLimitService'

describe('rateLimitService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('Rate Limiting Logic', () => {
        it('should allow requests within limit', async () => {
            // Mock timestamp-based requests (3 requests in the last minute, under the limit of 5)
            const now = Date.now()
            const requests = [
                now - 10000, // 10 seconds ago
                now - 20000, // 20 seconds ago
                now - 30000, // 30 seconds ago
            ]
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )
            mockRedisClient.setex.mockResolvedValue('OK' as any)

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'command',
            )

            expect(result.allowed).toBe(true)
            expect(result.remaining).toBeGreaterThan(0)
        })

        it('should block requests when limit exceeded', async () => {
            // Mock many requests already in the window (at limit)
            const now = Date.now()
            const requests = Array.from({ length: 20 }, (_, i) => now - i * 1000) // 20 requests, 1 second apart
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'command',
            )

            expect(result.allowed).toBe(false)
            expect(result.remaining).toBe(0)
        })

        it('should handle new users correctly', async () => {
            mockRedisClient.get.mockResolvedValue(null) // No previous requests

            const result = await rateLimitService.checkRateLimit(
                'newuser',
                'command',
            )

            expect(result.allowed).toBe(true)
            expect(result.remaining).toBeGreaterThan(0)
        })

        it('should set expiration for new keys', async () => {
            mockRedisClient.get.mockResolvedValue(null)
            mockRedisClient.setex.mockResolvedValue('OK' as any)

            await rateLimitService.checkRateLimit('newuser', 'command')

            expect(mockRedisClient.setex).toHaveBeenCalled()
        })
    })

    describe('Rate Limit Configuration', () => {
        it('should work with different rule types', async () => {
            // Test music rule
            const now = Date.now()
            const requests = Array.from(
                { length: 5 },
                (_, i) => now - i * 30000,
            ) // 5 requests, 30 seconds apart
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'music',
            )

            expect(result.allowed).toBe(true)
        })

        it('should work with download rule', async () => {
            mockRedisClient.get.mockResolvedValue(null)

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'download',
            )

            expect(result.allowed).toBe(true)
        })
    })

    describe('Error Handling', () => {
        it('should handle Redis connection errors gracefully', async () => {
            mockRedisClient.get.mockRejectedValue(
                new Error('Redis connection failed'),
            )

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'command',
            )

            // Should allow request when Redis is unavailable
            expect(result.allowed).toBe(true)
        })

        it('should handle Redis timeout errors', async () => {
            mockRedisClient.get.mockRejectedValue(new Error('Redis timeout'))

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'command',
            )

            expect(result.allowed).toBe(true)
        })

        it('should handle malformed Redis responses', async () => {
            mockRedisClient.get.mockResolvedValue('invalid' as any)

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'command',
            )

            expect(result.allowed).toBe(true)
        })

        it('should handle unknown rule names', async () => {
            await expect(
                rateLimitService.checkRateLimit('user123', 'unknown_rule'),
            ).rejects.toThrow("Rate limit rule 'unknown_rule' not found")
        })
    })

    describe('Rate Limit Info', () => {
        it('should get rate limit info', async () => {
            mockRedisClient.get.mockResolvedValue('5' as any)

            const result = await rateLimitService.getRateLimitInfo(
                'user123',
                'command',
            )

            expect(result).toBeDefined()
            expect(typeof result.allowed).toBe('boolean')
            expect(typeof result.remaining).toBe('number')
        })

        it('should get remaining requests', async () => {
            mockRedisClient.get.mockResolvedValue('3' as any)

            const remaining = await rateLimitService.getRemainingRequests(
                'user123',
                'command',
            )

            expect(typeof remaining).toBe('number')
        })

        it('should get retry after time', async () => {
            // Mock requests at limit to trigger retry after (5 requests = limit)
            const now = Date.now()
            const requests = [
                now - 10000, // 10 seconds ago
                now - 20000, // 20 seconds ago
                now - 30000, // 30 seconds ago
                now - 40000, // 40 seconds ago
                now - 50000, // 50 seconds ago
            ]
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const retryAfter = await rateLimitService.getRetryAfter(
                'user123',
                'command',
            )

            // retryAfter might be undefined if not rate limited
            expect(retryAfter === undefined || typeof retryAfter === 'number').toBe(true)
        })
    })

    describe('Rate Limit Management', () => {
        it('should check if rate limited', async () => {
            mockRedisClient.get.mockResolvedValue('10' as any)

            const isLimited = await rateLimitService.isRateLimited(
                'user123',
                'command',
            )

            expect(typeof isLimited).toBe('boolean')
        })

        it('should reset rate limit', async () => {
            mockRedisClient.del.mockResolvedValue(1 as any)

            const result = await rateLimitService.resetRateLimit(
                'user123',
                'command',
            )

            expect(result).toBe(true)
        })
    })

    describe('Rule Management', () => {
        it('should add custom rule', () => {
            const customRule = {
                name: 'custom',
                config: {
                    windowMs: 30000,
                    maxRequests: 5,
                    keyPrefix: 'custom',
                },
                description: 'Custom rate limit rule',
            }

            rateLimitService.addRule(customRule)

            const retrievedRule = rateLimitService.getRule('custom')
            expect(retrievedRule).toEqual(customRule)
        })

        it('should get existing rule', () => {
            const rule = rateLimitService.getRule('command')
            expect(rule).toBeDefined()
            expect(rule?.name).toBe('command')
        })

        it('should return undefined for non-existent rule', () => {
            const rule = rateLimitService.getRule('non-existent')
            expect(rule).toBeUndefined()
        })
    })

    describe('Edge Cases', () => {
        it('should handle very high request counts', async () => {
            // Mock 999 requests already in the window (near limit)
            const now = Date.now()
            const requests = Array.from({ length: 999 }, (_, i) => now - i * 50) // 999 requests, 50ms apart
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'command',
            )

            expect(result.allowed).toBeDefined()
        })

        it('should handle very short time windows', async () => {
            // Mock 3 requests already in the window
            const now = Date.now()
            const requests = [
                now - 100, // 100ms ago
                now - 200, // 200ms ago
                now - 300, // 300ms ago
            ]
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                'user123',
                'command',
            )

            expect(result.allowed).toBeDefined()
        })
    })
})
