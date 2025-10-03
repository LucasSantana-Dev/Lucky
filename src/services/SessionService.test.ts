/**
 * Unit tests for SessionService
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals"

// Mock Redis client before imports
const mockRedisClient = {
    get: jest.fn() as jest.MockedFunction<any>,
    set: jest.fn() as jest.MockedFunction<any>,
    del: jest.fn() as jest.MockedFunction<any>,
    exists: jest.fn() as jest.MockedFunction<any>,
    expire: jest.fn() as jest.MockedFunction<any>,
}

jest.mock("../config/redis", () => ({
    redisClient: mockRedisClient,
}))

import { sessionService } from "./SessionService"

describe("SessionService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("UserSession management", () => {
        it("should set user session", async () => {
            const sessionData = {
                userId: "user123",
                guildId: "guild456",
                channelId: "channel789",
                lastActivity: Date.now(),
                commandHistory: ["play", "pause"],
                preferences: { volume: 50 },
            }

            mockRedisClient.set.mockResolvedValue("OK" as any)

            await sessionService.setUserSession(sessionData)

            expect(mockRedisClient.set).toHaveBeenCalledWith(
                expect.stringContaining("user_session:user123:guild456"),
                expect.stringContaining(JSON.stringify(sessionData)),
                86400,
            )
        })

        it("should get user session", async () => {
            const sessionData = {
                userId: "user123",
                guildId: "guild456",
                channelId: "channel789",
                lastActivity: Date.now(),
                commandHistory: ["play"],
                preferences: { volume: 75 },
            }

            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(sessionData) as any,
            )

            const result = await sessionService.getUserSession(
                "user123",
                "guild456",
            )

            expect(mockRedisClient.get).toHaveBeenCalledWith(
                expect.stringContaining("user_session:user123:guild456"),
            )
            expect(result).toEqual(sessionData)
        })

        it("should clear user session", async () => {
            mockRedisClient.del.mockResolvedValue(1 as any)

            await sessionService.clearUserSession("user123", "guild456")

            expect(mockRedisClient.del).toHaveBeenCalledWith(
                expect.stringContaining("user_session:user123:guild456"),
            )
        })

        it("should clear user session", async () => {
            mockRedisClient.del.mockResolvedValue(1 as any)

            await sessionService.clearUserSession("user123", "guild456")

            expect(mockRedisClient.del).toHaveBeenCalledWith(
                expect.stringContaining("user_session:user123:guild456"),
            )
        })
    })

    describe("QueueSession management", () => {
        it("should set queue session", async () => {
            const queueData = {
                guildId: "guild456",
                channelId: "channel789",
                voiceChannelId: "voice123",
                lastTrackId: "track456",
                queuePosition: 0,
                isPlaying: true,
                volume: 50,
                repeatMode: 0,
                lastUpdated: Date.now(),
            }

            mockRedisClient.set.mockResolvedValue("OK" as any)

            await sessionService.setQueueSession(queueData)

            expect(mockRedisClient.set).toHaveBeenCalledWith(
                expect.stringContaining("queue_session:guild456"),
                expect.stringContaining(JSON.stringify(queueData)),
                7200,
            )
        })

        it("should get queue session", async () => {
            const queueData = {
                guildId: "guild456",
                channelId: "channel789",
                voiceChannelId: "voice123",
                queuePosition: 1,
                isPlaying: false,
                volume: 75,
                repeatMode: 1,
                lastUpdated: Date.now(),
            }

            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(queueData) as any,
            )

            const result = await sessionService.getQueueSession("guild456")

            expect(mockRedisClient.get).toHaveBeenCalledWith(
                expect.stringContaining("queue_session:guild456"),
            )
            expect(result).toEqual(queueData)
        })

        it("should update queue session", async () => {
            mockRedisClient.set.mockResolvedValue("OK" as any)

            await sessionService.updateQueueSession(
                "guild456",
                "channel789",
                "voice123",
                true,
                50,
                0,
                2,
                "track456",
            )

            expect(mockRedisClient.set).toHaveBeenCalledWith(
                expect.stringContaining("queue_session:guild456"),
                expect.any(String),
                7200,
            )
        })
    })

    describe("Error handling", () => {
        it("should handle Redis connection errors", async () => {
            mockRedisClient.get.mockRejectedValue(
                new Error("Redis connection failed") as any,
            )

            const result = await sessionService.getUserSession(
                "user123",
                "guild456",
            )

            expect(result).toBeNull()
        })

        it("should handle invalid JSON data", async () => {
            mockRedisClient.get.mockResolvedValue("invalid json" as any)

            const result = await sessionService.getUserSession(
                "user123",
                "guild456",
            )

            expect(result).toBeNull()
        })

        it("should handle missing sessions gracefully", async () => {
            mockRedisClient.get.mockResolvedValue(null as any)

            const result = await sessionService.getUserSession(
                "nonexistent",
                "guild456",
            )

            expect(result).toBeNull()
        })
    })

    describe("Session validation", () => {
        it("should validate session data structure", async () => {
            const invalidSession = {
                userId: "user123",
                guildId: "guild456",
                channelId: "channel789",
                // Missing required fields
                lastActivity: Date.now(),
            }

            mockRedisClient.set.mockResolvedValue("OK" as any)

            // Should not throw error, but may not store all fields
            await expect(
                sessionService.setUserSession(invalidSession as any),
            ).resolves.not.toThrow()
        })
    })
})
