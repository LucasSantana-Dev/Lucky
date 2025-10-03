import Redis from "ioredis"
import { debugLog, errorLog, infoLog, warnLog } from "../utils/general/log"
import { ENVIRONMENT_CONFIG } from "./environmentConfig"

// Type guard for process
declare const process: NodeJS.Process

type RedisConfig = {
    host: string
    port: number
    password?: string
    db: number
    retryDelayOnFailover: number
    maxRetriesPerRequest: number
    lazyConnect: boolean
}

class RedisClient {
    private client: Redis | null = null
    private isConnected = false
    private reconnectAttempts = 0
    private maxReconnectAttempts = 5

    constructor() {
        this.initializeClient()
    }

    private initializeClient(): void {
        try {
            const config: RedisConfig = {
                host: ENVIRONMENT_CONFIG.REDIS.HOST,
                port: ENVIRONMENT_CONFIG.REDIS.PORT,
                password: ENVIRONMENT_CONFIG.REDIS.PASSWORD,
                db: ENVIRONMENT_CONFIG.REDIS.DB,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            }

            this.client = new Redis(config)

            this.client.on("connect", () => {
                this.isConnected = true
                this.reconnectAttempts = 0
                infoLog({ message: "Connected to Redis" })
            })

            this.client.on("ready", () => {
                debugLog({ message: "Redis client ready" })
            })

            this.client.on("error", (error: Error) => {
                this.isConnected = false
                errorLog({ message: "Redis connection error:", error })
            })

            this.client.on("close", () => {
                this.isConnected = false
                warnLog({ message: "Redis connection closed" })
            })

            this.client.on("reconnecting", () => {
                this.reconnectAttempts++
                if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                    debugLog({
                        message: `Reconnecting to Redis (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
                    })
                } else {
                    errorLog({
                        message: `Failed to reconnect to Redis after ${this.maxReconnectAttempts} attempts`,
                    })
                }
            })
        } catch (error) {
            errorLog({ message: "Failed to initialize Redis client:", error })
            this.client = null
        }
    }

    async connect(): Promise<boolean> {
        if (!this.client) {
            errorLog({ message: "Redis client not initialized" })
            return false
        }

        try {
            if (!this.isConnected) {
                await this.client.connect()
                debugLog({ message: "Redis connection initiated" })
            }
            return this.isConnected
        } catch (error) {
            errorLog({ message: "Failed to connect to Redis:", error })
            return false
        }
    }

    async disconnect(): Promise<void> {
        if (this.client && this.isConnected) {
            try {
                await this.client.disconnect()
                this.isConnected = false
                infoLog({ message: "Disconnected from Redis" })
            } catch (error) {
                errorLog({ message: "Error disconnecting from Redis:", error })
            }
        }
    }

    isHealthy(): boolean {
        return this.isConnected && this.client !== null
    }

    async get(key: string): Promise<string | null> {
        if (!this.isHealthy()) {
            debugLog({ message: "Redis not available, skipping get operation" })
            return null
        }

        try {
            if (!this.client) return null
            return await this.client.get(key)
        } catch (error) {
            errorLog({ message: `Redis GET error for key ${key}:`, error })
            return null
        }
    }

    async set(
        key: string,
        value: string,
        ttlSeconds?: number,
    ): Promise<boolean> {
        if (!this.isHealthy()) {
            debugLog({ message: "Redis not available, skipping set operation" })
            return false
        }

        try {
            if (!this.client) return false
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, value)
            } else {
                await this.client.set(key, value)
            }
            return true
        } catch (error) {
            errorLog({ message: `Redis SET error for key ${key}:`, error })
            return false
        }
    }

    async del(key: string): Promise<boolean> {
        if (!this.isHealthy()) {
            debugLog({
                message: "Redis not available, skipping delete operation",
            })
            return false
        }

        try {
            if (!this.client) return false
            const result = await this.client.del(key)
            return result > 0
        } catch (error) {
            errorLog({ message: `Redis DEL error for key ${key}:`, error })
            return false
        }
    }

    async exists(key: string): Promise<boolean> {
        if (!this.isHealthy()) {
            debugLog({
                message: "Redis not available, skipping exists operation",
            })
            return false
        }

        try {
            if (!this.client) return false
            const result = await this.client.exists(key)
            return result === 1
        } catch (error) {
            errorLog({ message: `Redis EXISTS error for key ${key}:`, error })
            return false
        }
    }

    async expire(key: string, seconds: number): Promise<boolean> {
        if (!this.isHealthy()) {
            debugLog({
                message: "Redis not available, skipping expire operation",
            })
            return false
        }

        try {
            if (!this.client) return false
            const result = await this.client.expire(key, seconds)
            return result === 1
        } catch (error) {
            errorLog({ message: `Redis EXPIRE error for key ${key}:`, error })
            return false
        }
    }

    async keys(pattern: string): Promise<string[]> {
        if (!this.isHealthy()) {
            debugLog({
                message: "Redis not available, skipping keys operation",
            })
            return []
        }

        try {
            if (!this.client) return []
            return await this.client.keys(pattern)
        } catch (error) {
            errorLog({
                message: `Redis KEYS error for pattern ${pattern}:`,
                error,
            })
            return []
        }
    }

    // Graceful shutdown
    async shutdown(): Promise<void> {
        await this.disconnect()
    }
}

// Export singleton instance
export const redisClient = new RedisClient()

// Graceful shutdown handler
process.on("SIGINT", async () => {
    await redisClient.shutdown()
    process.exit(0)
})

process.on("SIGTERM", async () => {
    await redisClient.shutdown()
    process.exit(0)
})
