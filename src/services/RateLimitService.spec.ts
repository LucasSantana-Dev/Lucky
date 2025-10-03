/**
 * Unit tests for RateLimitService
 * Testing rate limiting behavior and edge cases
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals"

// Mock Redis client before imports
const mockRedisClient = {
    get: jest.fn() as jest.MockedFunction<any>,
    set: jest.fn() as jest.MockedFunction<any>,
    del: jest.fn() as jest.MockedFunction<any>,
    exists: jest.fn() as jest.MockedFunction<any>,
    expire: jest.fn() as jest.MockedFunction<any>,
    incr: jest.fn() as jest.MockedFunction<any>,
}

jest.mock("../config/redis", () => ({
    redisClient: mockRedisClient,
}))

import { rateLimitService } from "./RateLimitService"

describe("rateLimitService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("Rate Limiting Logic", () => {
        it("should allow requests within limit", async () => {
            const config = {
                windowMs: 60000, // 1 minute
                maxRequests: 10,
                keyPrefix: "test",
            }

            // Mock timestamp-based requests (5 requests in the last minute)
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

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(true)
            expect(result.remaining).toBe(5) // 10 - 5
        })

        it("should block requests when limit exceeded", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 5,
                keyPrefix: "test",
            }

            // Mock 5 requests already in the window (at limit)
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

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(false)
            expect(result.remaining).toBe(0)
        })

        it("should handle new users correctly", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 10,
                keyPrefix: "test",
            }

            mockRedisClient.get.mockResolvedValue(null) // No previous requests

            const result = await rateLimitService.checkRateLimit(
                "newuser",
                config,
            )

            expect(result.allowed).toBe(true)
            expect(result.remaining).toBe(10) // 10 - 0 (no requests yet, remaining calculated before adding current)
        })

        it("should set expiration for new keys", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 10,
                keyPrefix: "test",
            }

            mockRedisClient.get.mockResolvedValue(null)

            await rateLimitService.checkRateLimit("newuser", config)

            expect(mockRedisClient.set).toHaveBeenCalledWith(
                expect.stringContaining("test:newuser"),
                expect.any(String),
                60, // 60 seconds
            )
        })
    })

    describe("Rate Limit Configuration", () => {
        it("should work with different time windows", async () => {
            const config = {
                windowMs: 300000, // 5 minutes
                maxRequests: 20,
                keyPrefix: "test",
            }

            // Mock 10 requests in the last 5 minutes
            const now = Date.now()
            const requests = Array.from(
                { length: 10 },
                (_, i) => now - i * 30000,
            ) // 10 requests, 30 seconds apart
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(true)
            expect(result.remaining).toBe(10) // 20 - 10 (remaining calculated before adding current)
        })

        it("should work with different request limits", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1, // Very restrictive
                keyPrefix: "test",
            }

            // Mock 1 request already in the window (at limit)
            const now = Date.now()
            const requests = [now - 30000] // 1 request 30 seconds ago
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(false)
            expect(result.remaining).toBe(0)
        })

        it("should work with different key prefixes", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 10,
                keyPrefix: "music",
            }

            mockRedisClient.get.mockResolvedValue("3" as any)
            mockRedisClient.incr.mockResolvedValue(4 as any)

            await rateLimitService.checkRateLimit("user123", config)

            expect(mockRedisClient.get).toHaveBeenCalledWith(
                expect.stringContaining("music:user123"),
            )
        })
    })

    describe("Error Handling", () => {
        it("should handle Redis connection errors gracefully", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 10,
                keyPrefix: "test",
            }

            mockRedisClient.get.mockRejectedValue(
                new Error("Redis connection failed"),
            )

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            // Should allow request when Redis is unavailable
            expect(result.allowed).toBe(true)
        })

        it("should handle Redis timeout errors", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 10,
                keyPrefix: "test",
            }

            mockRedisClient.get.mockRejectedValue(new Error("Redis timeout"))

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(true)
        })

        it("should handle malformed Redis responses", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 10,
                keyPrefix: "test",
            }

            mockRedisClient.get.mockResolvedValue("invalid" as any)
            mockRedisClient.incr.mockResolvedValue(1 as any)

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(true)
        })
    })

    describe("Rate Limit Reset", () => {
        it("should calculate reset time correctly", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 10,
                keyPrefix: "test",
            }

            const now = Date.now()
            jest.spyOn(Date, "now").mockReturnValue(now)

            mockRedisClient.get.mockResolvedValue("5" as any)
            mockRedisClient.incr.mockResolvedValue(6 as any)

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.resetTime).toBe(now + 60000)
        })

        it("should provide retry after time when blocked", async () => {
            const config = {
                windowMs: 30000, // 30 seconds
                maxRequests: 5,
                keyPrefix: "test",
            }

            const now = Date.now()
            jest.spyOn(Date, "now").mockReturnValue(now)

            // Mock 5 requests already in the window (at limit)
            const requests = [
                now - 5000, // 5 seconds ago
                now - 10000, // 10 seconds ago
                now - 15000, // 15 seconds ago
                now - 20000, // 20 seconds ago
                now - 25000, // 25 seconds ago
            ]
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(false)
            expect(result.retryAfter).toBeGreaterThan(0)
        })
    })

    describe("Edge Cases", () => {
        it("should handle very high request counts", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 1000,
                keyPrefix: "test",
            }

            // Mock 999 requests already in the window (near limit)
            const now = Date.now()
            const requests = Array.from({ length: 999 }, (_, i) => now - i * 50) // 999 requests, 50ms apart (all within 60s window)
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(requests) as any,
            )

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(true)
            expect(result.remaining).toBe(1) // 1000 - 999 (all requests are within the 60s window)
        })

        it("should handle zero max requests", async () => {
            const config = {
                windowMs: 60000,
                maxRequests: 0,
                keyPrefix: "test",
            }

            // Mock no previous requests
            mockRedisClient.get.mockResolvedValue(null as any)

            const result = await rateLimitService.checkRateLimit(
                "user123",
                config,
            )

            expect(result.allowed).toBe(false)
            expect(result.remaining).toBe(0)
        })

        it("should handle very short time windows", async () => {
            const config = {
                windowMs: 1000, // 1 second
                maxRequests: 5,
                keyPrefix: "test",
            }

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
                "user123",
                config,
            )

            expect(result.allowed).toBe(true)
            expect(result.remaining).toBe(2) // 5 - 3
        })
    })
})
