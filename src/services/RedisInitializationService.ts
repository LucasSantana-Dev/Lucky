import { redisClient } from "../config/redis"
import { trackHistoryService } from "./TrackHistoryService"
import { guildSettingsService } from "./GuildSettingsService"
import { rateLimitService } from "./RateLimitService"
import { sessionService } from "./SessionService"
import { infoLog, errorLog, debugLog } from "../utils/general/log"

class RedisInitializationService {
    private isInitialized = false

    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            debugLog({ message: "Redis services already initialized" })
            return true
        }

        try {
            infoLog({ message: "Initializing Redis services..." })

            // Connect to Redis
            const connected = await redisClient.connect()
            if (!connected) {
                errorLog({ message: "Failed to connect to Redis" })
                return false
            }

            // Test Redis connection
            const isHealthy = redisClient.isHealthy()
            if (!isHealthy) {
                errorLog({ message: "Redis connection is not healthy" })
                return false
            }

            // Initialize services (they don't need explicit initialization, but we can test them)
            await this.testServices()

            this.isInitialized = true
            infoLog({ message: "Redis services initialized successfully" })
            return true
        } catch (error) {
            errorLog({ message: "Error initializing Redis services:", error })
            return false
        }
    }

    /**
     * Test all Redis services
     */
    private async testServices(): Promise<void> {
        try {
            // Test Redis client
            const testKey = "redis_test_key"
            const testValue = "test_value"

            await redisClient.set(testKey, testValue, 10) // 10 second TTL
            const retrievedValue = await redisClient.get(testKey)

            if (retrievedValue !== testValue) {
                throw new Error("Redis test failed - value mismatch")
            }

            await redisClient.del(testKey)
            debugLog({ message: "Redis client test passed" })

            // Test services with dummy data
            const testGuildId = "test_guild_123"
            const testUserId = "test_user_123"

            // Test track history service
            await trackHistoryService.clearGuildHistory(testGuildId)
            debugLog({ message: "Track history service test passed" })

            // Test guild settings service
            await guildSettingsService.clearGuildData(testGuildId)
            debugLog({ message: "Guild settings service test passed" })

            // Test rate limit service
            const rateLimitResult =
                await rateLimitService.checkCommandRateLimit(
                    testUserId,
                    "test_command",
                    1000, // 1 second
                    1, // 1 request
                )
            if (!rateLimitResult.allowed) {
                throw new Error("Rate limit service test failed")
            }
            debugLog({ message: "Rate limit service test passed" })

            // Test session service
            await sessionService.clearGuildSessions(testGuildId)
            debugLog({ message: "Session service test passed" })
        } catch (error) {
            errorLog({ message: "Error testing Redis services:", error })
            throw error
        }
    }

    /**
     * Shutdown all Redis services
     */
    async shutdown(): Promise<void> {
        try {
            infoLog({ message: "Shutting down Redis services..." })

            await redisClient.shutdown()

            this.isInitialized = false
            infoLog({ message: "Redis services shut down successfully" })
        } catch (error) {
            errorLog({ message: "Error shutting down Redis services:", error })
        }
    }

    /**
     * Get initialization status
     */
    isServiceInitialized(): boolean {
        return this.isInitialized
    }

    /**
     * Get Redis health status
     */
    getHealthStatus(): {
        isInitialized: boolean
        isConnected: boolean
        isHealthy: boolean
    } {
        return {
            isInitialized: this.isInitialized,
            isConnected: redisClient.isHealthy(),
            isHealthy: redisClient.isHealthy(),
        }
    }
}

// Export singleton instance
export const redisInitializationService = new RedisInitializationService()

// Graceful shutdown handler
declare const process: NodeJS.Process

process.on("SIGINT", async () => {
    await redisInitializationService.shutdown()
})

process.on("SIGTERM", async () => {
    await redisInitializationService.shutdown()
})
